import { Chess } from 'chess.js';
import type { PositionAnalysis } from '@/lib/engine/uci';
import type { PlyRecord } from '@/lib/games/pgn';
import { NEGATIVE, POSITIVE, ideaClause, moveIdeas, type Idea } from './motifs';
import type { Classified } from './review';
import { PIECE_NAME, detectFork, hangingPieces, materialSwing, uciLineToSan } from './tactics';
import type { Explanation } from './types';

export interface ExplainInput {
  ply: PlyRecord;
  classified: Classified;
  before: PositionAnalysis;
  after: PositionAnalysis;
  bestLine: string[];
  replyLine: string[];
  prevPly?: PlyRecord;
  opening?: string;
  /** The player the review is written for ("you"); unknown for pasted PGNs. */
  perspective?: 'w' | 'b';
}

/** Describe a win% (mover's POV) in words. */
export function describeWin(win: number): string {
  if (win >= 97) return 'a winning position';
  if (win >= 80) return 'a large advantage';
  if (win >= 65) return 'a clear advantage';
  if (win >= 56) return 'a slight edge';
  if (win > 44) return 'equality';
  if (win > 35) return 'a slightly worse position';
  if (win > 20) return 'a clearly worse position';
  if (win > 3) return 'a losing position';
  return 'a lost position';
}

/** "1. e4 e5 2. Nf3" style formatting for a SAN line starting at `fen`. */
export function formatLine(fen: string, san: string[], max = 6): string {
  const parts = fen.split(' ');
  let moveNo = Number(parts[5]) || 1;
  let white = parts[1] === 'w';
  const out: string[] = [];
  san.slice(0, max).forEach((m, i) => {
    if (white) out.push(`${moveNo}. ${m}`);
    else out.push(i === 0 ? `${moveNo}... ${m}` : m);
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

const mateIn = (a: PositionAnalysis) => {
  const s = a.lines[0]?.score;
  return typeof s?.mate === 'number' && s.mate !== 0 ? s.mate : null;
};

/**
 * Grammar for talking about the mover: "You keep…" when it's the reader's
 * move, "Your opponent keeps…" when it isn't, "White keeps…" when we don't
 * know who the reader is.
 */
export function voice(mover: 'w' | 'b', perspective?: 'w' | 'b') {
  const isYou = perspective === mover;
  const subject = isYou ? 'You' : perspective ? 'Your opponent' : mover === 'w' ? 'White' : 'Black';
  const verb = (base: string, third: string) => `${subject} ${isYou ? base : third}`;
  return {
    /** "You go" / "Your opponent goes" */
    verb,
    isYou,
    /** Possessive for the mover's pieces. */
    own: isYou ? 'your' : perspective ? 'their' : 'the',
    /** Possessive for the other side's pieces. */
    theirs: perspective && !isYou ? 'your' : 'the',
  };
}

/* ── Sentence helpers ──────────────────────────────────────────────── */

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "pins the knight" → "pinning the knight", for "Best was Bb5, pinning the knight". */
function participle(clause: string): string {
  const [verb, ...rest] = clause.split(' ');
  const doubled: Record<string, string> = { pins: 'pinning', puts: 'putting', wins: 'winning' };
  let ing = doubled[verb];
  if (!ing) {
    const stem = /(sh|ch|ss|x)es$/.test(verb) || verb === 'fianchettoes' ? verb.slice(0, -2) : verb.slice(0, -1);
    ing = (/[^e]e$/.test(stem) ? stem.slice(0, -1) : stem) + 'ing';
  }
  return [ing, ...rest].join(' ');
}

/** "a pawn", "a piece", "the exchange"… for a material gain in pawns. */
function gainWords(pawns: number): string {
  if (pawns >= 8) return 'the queen';
  if (pawns >= 5) return 'a rook';
  if (pawns >= 3) return 'a piece';
  if (pawns >= 2) return 'material';
  return 'a pawn';
}

/** Small, stable variety so the coach doesn't repeat itself word for word. */
function pick<T>(options: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}

/** The positive ideas worth saying about a move, as clauses ("develops your knight"). */
function praise(ideas: Idea[], own: string, theirs: string, max = 2): string[] {
  const kinds = new Set<string>();
  const out: string[] = [];
  for (const idea of ideas) {
    if (!POSITIVE.includes(idea.kind) || kinds.has(idea.kind)) continue;
    // Plain checks and side captures aren't worth a sentence next to a real idea.
    if (out.length && (idea.kind === 'capture' || idea.kind === 'center')) continue;
    const clause = ideaClause(idea, own, theirs);
    if (!clause) continue;
    kinds.add(idea.kind);
    out.push(clause);
    if (out.length >= max) break;
  }
  return out;
}

function thisSentence(clauses: string[]): string | null {
  if (!clauses.length) return null;
  return `This ${clauses.length === 1 ? clauses[0] : `${clauses[0]} and ${clauses[1]}`}.`;
}

/* ── The explanation ───────────────────────────────────────────────── */

export function explainMove(input: ExplainInput): Explanation {
  const { ply, classified, before, after, bestLine, replyLine, perspective } = input;
  const { classification, winBest, winPlayed } = classified;
  const v = voice(ply.color, perspective);
  const san = ply.san;
  const seed = ply.fenBefore + ply.uci;
  const best = bestLine[0];
  const bestUci = before.lines[0]?.pv[0];
  const bestText = best ? formatLine(before.fen, bestLine, 5) : '';
  const replyText = replyLine.length ? formatLine(after.fen, replyLine, 5) : '';
  const details: string[] = [];

  // Mate facts from both searches. `before` is mover-to-move, `after` is opponent-to-move.
  const moverMate = mateIn(before);
  const opponentMate = mateIn(after);
  const deliveredMate = new Chess(ply.fenAfter).isCheckmate();

  const prevMove = input.prevPly ? { to: input.prevPly.to, captured: input.prevPly.captured } : undefined;
  const ideas = moveIdeas(ply.fenBefore, ply.uci, { prevMove });
  const afterPv = after.lines[0]?.pv ?? [];

  /** "This forks your king and rook, winning material." */
  const playedIdea = (): string | null => {
    const clauses = praise(ideas, v.own, v.theirs);
    if (!clauses.length) return null;
    // Tactics that cash in along the engine's line say so.
    const tactical = ideas.some((i) =>
      ['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'threat', 'mateThreat'].includes(i.kind),
    );
    if (tactical && winPlayed < 97) {
      const gain = materialSwing(ply.fenBefore, [ply.uci, ...afterPv], ply.color, 5);
      if (gain >= 2) return `${thisSentence(clauses.slice(0, 1))!.slice(0, -1)}, winning ${gainWords(gain)}.`;
    }
    return thisSentence(clauses);
  };

  /** "Best was Bb5, pinning the knight to the king." */
  const bestIdea = (prefix = 'Best was'): string | null => {
    if (!best || !bestUci) return null;
    if (moverMate !== null && moverMate > 0) return `${prefix} ${best}, starting a forced mate in ${moverMate}.`;
    // Only material the played move didn't win as well.
    const gain =
      materialSwing(before.fen, before.lines[0]?.pv ?? [], ply.color, 5) -
      Math.max(0, materialSwing(ply.fenBefore, [ply.uci, ...afterPv], ply.color, 5));
    const bestIdeas = moveIdeas(before.fen, bestUci, { prevMove });
    const clause = praise(bestIdeas, v.own, v.theirs, 1)[0];
    // Small gains deep in a line are noise next to a move that was nearly as good.
    const worthIt = ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(classification) ? 1 : 3;
    if (gain >= worthIt && winBest < 97) {
      const how = clause && !/takes|picks up|captures/.test(clause) ? `${participle(clause)} and ` : '';
      return `${prefix} ${best}, ${how}winning ${gainWords(gain)}.`;
    }
    if (clause) return `${prefix} ${best}, ${participle(clause)}.`;
    return null;
  };

  const evalSentence = () => {
    const from = describeWin(winBest);
    const to = describeWin(winPlayed);
    if (from !== to) return `${v.verb('go', 'goes')} from ${from} to ${to}.`;
    if (to === 'equality') return `The position is still balanced, but ${best ?? 'the best move'} was more accurate.`;
    if (winPlayed >= 50) return `${v.verb('still have', 'still has')} ${to}, but ${v.isYou ? 'let' : 'lets'} some of it slip.`;
    return `${v.verb('are', 'is')} still in ${to}, and it just got harder to hold.`;
  };

  /** "You have a clear advantage." / "The position is equal." */
  const standing = (win: number) =>
    describeWin(win) === 'equality' ? 'The position is equal.' : `${v.verb('have', 'has')} ${describeWin(win)}.`;

  switch (classification) {
    case 'book': {
      const idea = thisSentence(praise(ideas, v.own, v.theirs, 1));
      return {
        headline: `${san} is a book move`,
        details: [input.opening ?? 'A well-known move from opening theory.', ...(idea ? [idea] : [])],
      };
    }

    case 'forced':
      return { headline: `${san} is forced`, details: ['It was the only legal move.'] };

    case 'brilliant': {
      const s = classified.sacrifice;
      details.push(
        s
          ? `${pick(['A brilliant sacrifice!', 'What a find!', 'Brilliant!'], seed)} ${capitalise(v.own)} ${PIECE_NAME[s.piece]} on ${s.square} is offered, and taking it would be a mistake.`
          : 'A brilliant move!',
      );
      const idea = playedIdea();
      if (idea && !/takes a free|captures/.test(idea)) details.push(idea);
      if (replyText) details.push(`Best play continues ${replyText}.`);
      details.push(`${v.verb('keep', 'keeps')} ${describeWin(winPlayed)}.`);
      return { headline: `${san} is brilliant`, details };
    }

    case 'great': {
      const second = before.lines[1];
      const secondSan = second ? uciLineToSan(before.fen, second.pv, 1)[0] : undefined;
      details.push(playedIdea() ?? pick(['The only good move here!', 'Well found!', 'A great find!'], seed));
      details.push(
        `It's the only move that keeps ${describeWin(winPlayed)}${secondSan ? `; ${secondSan} was much weaker` : ''}.`,
      );
      if (replyText) details.push(`Play continues ${replyText}.`);
      return { headline: `${san} is a great move`, details };
    }

    case 'best':
    case 'excellent':
    case 'good': {
      if (deliveredMate) return { headline: `${san} is checkmate`, details: [pick(['Game over!', 'Checkmate. Well played!', 'And that’s mate.'], seed)] };
      const headline = classification === 'best' ? `${san} is best` : classification === 'excellent' ? `${san} is excellent` : `${san} is good`;
      const playedMate = opponentMate !== null && opponentMate < 0 ? -opponentMate : null;
      const idea = playedMate ? `This forces mate in ${playedMate}.` : playedIdea();
      if (idea) details.push(idea);
      if (classification !== 'best') {
        const better = bestIdea(classification === 'excellent' ? 'Slightly more precise was' : 'Better was');
        details.push(better ?? `${best} was ${classification === 'excellent' ? 'slightly' : 'a little'} more precise.`);
      }
      if (!idea && classification === 'best') {
        details.push(
          winPlayed >= 56
            ? `${v.verb('keep', 'keeps')} ${describeWin(winPlayed)}.`
            : winPlayed > 44
              ? 'This keeps the balance.'
              : `${v.verb('hold', 'holds')} on as well as possible.`,
        );
      } else details.push(standing(winPlayed));
      return { headline, details };
    }

    default:
      break;
  }

  // Inaccuracy / mistake / miss / blunder: find the most concrete reason.
  const label =
    classification === 'inaccuracy'
      ? 'an inaccuracy'
      : classification === 'mistake'
        ? 'a mistake'
        : classification === 'miss'
          ? 'a miss'
          : 'a blunder';
  const headline = `${san} is ${label}`;
  const reply = afterPv;
  const replyIdeas = reply[0] ? moveIdeas(after.fen, reply[0], { prevMove: { to: ply.to, captured: ply.captured } }) : [];
  const replyClause = (kinds: Idea['kind'][]) => {
    const idea = replyIdeas.find((i) => kinds.includes(i.kind));
    // The reply is the opponent's: their targets are the mover's pieces.
    return idea ? ideaClause(idea, v.theirs === 'your' ? 'their' : v.theirs, v.own) : null;
  };

  let reason: string | null = null;
  if (opponentMate !== null && opponentMate > 0 && !(moverMate !== null && moverMate < 0)) {
    reason = `This allows checkmate in ${opponentMate}: ${replyText}.`;
  } else if (moverMate !== null && moverMate > 0 && !(opponentMate !== null && opponentMate < 0)) {
    reason = `${v.isYou ? 'You missed' : perspective ? 'Your opponent missed' : 'Missed'} a forced mate in ${moverMate}: ${bestText}.`;
  } else {
    const hanging = hangingPieces(ply.fenAfter, ply.color)[0];
    const gainBest = materialSwing(before.fen, before.lines[0]?.pv ?? [], ply.color);
    // Net material from before the move, so a capture that gets taken back is a trade, not a loss.
    const gainPlayed = materialSwing(ply.fenBefore, [ply.uci, ...reply], ply.color);
    const lossAfter = Math.min(0, gainPlayed);
    const fork = reply[0] ? detectFork(after.fen, reply[0]) : null;
    const hangingTaken = hanging && hanging.loss >= 2 && reply.slice(0, 3).some((m) => m.slice(2, 4) === hanging.square);
    const tactic = replyClause(['pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'mateThreat']);

    if (fork && lossAfter <= -2) {
      const names = fork.targets.map((t) => `${PIECE_NAME[t.piece]} on ${t.square}`).join(' and ');
      reason = `This allows a fork: ${replyLine[0]} attacks ${v.own} ${names}.`;
    } else if (hanging && hangingTaken && lossAfter <= -2) {
      reason =
        hanging.square === ply.to
          ? `This hangs ${v.own} ${PIECE_NAME[hanging.piece]}: ${replyText}.`
          : `This leaves ${v.own} ${PIECE_NAME[hanging.piece]} on ${hanging.square} undefended: ${replyText}.`;
    } else if (tactic && lossAfter <= -1) {
      reason = `This allows ${replyLine[0]}, which ${tactic}.`;
    } else if (lossAfter <= -2) {
      reason = `This loses ${gainWords(-lossAfter)} after ${replyText}.`;
    } else if (lossAfter <= -1 && gainBest - lossAfter >= 1) {
      reason = `This drops a pawn: ${replyText}.`;
    } else if (gainBest - gainPlayed >= 1 && winBest < 97) {
      const what = gainWords(gainBest - gainPlayed);
      reason =
        classification === 'miss'
          ? `${v.isYou ? 'You missed' : perspective ? 'Your opponent missed' : 'Missed'} a chance to win ${what} with ${best}.`
          : `This misses a chance to win ${what} with ${best}.`;
    } else if (tactic) {
      reason = `This allows ${replyLine[0]}, which ${tactic}.`;
    } else if (classification === 'miss') {
      reason = v.isYou
        ? `Your opponent's last move gave you a chance, and it slipped away.`
        : perspective
          ? 'Your last move was a mistake, but it went unpunished.'
          : 'The previous mistake went unpunished.';
    } else {
      const flaw = ideas.find((i) => NEGATIVE.includes(i.kind));
      if (flaw) reason = `This ${ideaClause(flaw, v.own, v.theirs)}.`;
    }
  }

  if (reason) details.push(reason);
  details.push(evalSentence());
  // Unless the reason already named the better move.
  const named = !!best && !!reason?.includes(`with ${best}`);
  if (!named && !(moverMate !== null && moverMate > 0)) {
    const better = bestIdea();
    if (better) details.push(better);
    else if (best) details.push(`Best was ${bestText}.`);
  }
  return { headline, details };
}
