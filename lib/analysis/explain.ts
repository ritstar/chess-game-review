import { Chess } from 'chess.js';
import type { PositionAnalysis } from '@/lib/engine/uci';
import type { PlyRecord } from '@/lib/games/pgn';
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

export function explainMove(input: ExplainInput): Explanation {
  const { ply, classified, before, after, bestLine, replyLine } = input;
  const { classification, winBest, winPlayed } = classified;
  const san = ply.san;
  const best = bestLine[0];
  const bestText = best ? formatLine(before.fen, bestLine, 5) : '';
  const replyText = replyLine.length ? formatLine(after.fen, replyLine, 5) : '';
  const details: string[] = [];

  // Mate facts from both searches. `before` is mover-to-move, `after` is opponent-to-move.
  const moverMate = mateIn(before);
  const opponentMate = mateIn(after);
  const deliveredMate = new Chess(ply.fenAfter).isCheckmate();

  switch (classification) {
    case 'book':
      return {
        headline: `${san} is a book move`,
        details: input.opening ? [input.opening] : ['A well-known move from opening theory.'],
      };

    case 'forced':
      return { headline: `${san} is forced`, details: ['It was the only legal move.'] };

    case 'brilliant': {
      const s = classified.sacrifice;
      if (s) {
        details.push(
          `Sacrifices the ${PIECE_NAME[s.piece]} on ${s.square} — the opponent can't profit from taking it.`,
        );
      }
      if (replyText) details.push(`Best play continues ${replyText}.`);
      details.push(`You keep ${describeWin(winPlayed)}.`);
      return { headline: `${san} is brilliant!`, details };
    }

    case 'great': {
      const fork = detectFork(ply.fenBefore, ply.uci);
      if (fork) details.push(`Forks the ${fork.targets.map((t) => PIECE_NAME[t.piece]).join(' and ')}.`);
      const second = before.lines[1];
      const secondSan = second ? uciLineToSan(before.fen, second.pv, 1)[0] : undefined;
      details.push(
        `The only move that keeps ${describeWin(winPlayed)}${secondSan ? ` — ${secondSan} was much weaker` : ''}.`,
      );
      if (replyText) details.push(`Play continues ${replyText}.`);
      return { headline: `${san} is a great move`, details };
    }

    case 'best':
    case 'excellent':
    case 'good': {
      if (deliveredMate) return { headline: `${san} is checkmate`, details: ['Game over.'] };
      const headline =
        classification === 'best'
          ? `${san} is the best move`
          : classification === 'excellent'
            ? `${san} is excellent`
            : `${san} is a good move`;
      const playedMate = opponentMate !== null && opponentMate < 0 ? -opponentMate : null;
      const fork = detectFork(ply.fenBefore, ply.uci);
      if (playedMate) details.push(`Forces mate in ${playedMate}.`);
      else if (fork) details.push(`Forks the ${fork.targets.map((t) => PIECE_NAME[t.piece]).join(' and ')}.`);
      else {
        // Measure from before the opponent's last move so recapturing isn't "winning material".
        const base = input.prevPly ?? ply;
        const line = input.prevPly ? [input.prevPly.uci, ply.uci] : [ply.uci];
        const gain = materialSwing(base.fenBefore, [...line, ...(after.lines[0]?.pv ?? [])], ply.color, line.length + 3);
        if (gain >= 2 && winPlayed < 97) details.push(`Wins material${replyText ? `: ${formatLine(ply.fenBefore, [san, ...replyLine], 5)}` : ''}.`);
      }
      if (classification !== 'best' && best) details.push(`${best} was slightly more precise.`);
      details.push(`You have ${describeWin(winPlayed)}.`);
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

  if (opponentMate !== null && opponentMate > 0 && !(moverMate !== null && moverMate < 0)) {
    details.push(`Allows mate in ${opponentMate}: ${replyText}.`);
  } else if (moverMate !== null && moverMate > 0 && !(opponentMate !== null && opponentMate < 0)) {
    details.push(`Missed mate in ${moverMate}: ${bestText}.`);
  } else {
    const hanging = hangingPieces(ply.fenAfter, ply.color)[0];
    const lossAfter = materialSwing(after.fen, after.lines[0]?.pv ?? [], ply.color);
    const gainBest = materialSwing(before.fen, before.lines[0]?.pv ?? [], ply.color);
    const gainPlayed = materialSwing(ply.fenBefore, [ply.uci, ...(after.lines[0]?.pv ?? [])], ply.color);

    const reply = after.lines[0]?.pv ?? [];
    const fork = reply[0] ? detectFork(after.fen, reply[0]) : null;
    const hangingTaken = hanging && hanging.loss >= 2 && reply.slice(0, 3).some((m) => m.slice(2, 4) === hanging.square);

    if (fork && lossAfter <= -2) {
      const names = fork.targets.map((t) => `${PIECE_NAME[t.piece]} on ${t.square}`).join(' and ');
      details.push(`Allows a fork: ${replyLine[0]} attacks your ${names}.`);
    } else if (hanging && hangingTaken && lossAfter <= -2) {
      const own = hanging.square === ply.to ? 'moves the' : 'leaves the';
      details.push(`This ${own} ${PIECE_NAME[hanging.piece]} on ${hanging.square} undefended: ${replyText}.`);
    } else if (lossAfter <= -2) {
      details.push(`Loses material after ${replyText}.`);
    } else if (lossAfter <= -1 && gainBest - lossAfter >= 1) {
      details.push(`Drops a pawn: ${replyText}.`);
    } else if (gainBest - gainPlayed >= 2) {
      details.push(`Missed a chance to win material with ${best}.`);
    } else if (classification === 'miss') {
      details.push(`Your opponent's last move gave you a chance that slipped away.`);
    }
  }

  const from = describeWin(winBest);
  const to = describeWin(winPlayed);
  if (from !== to) details.push(`You go from ${from} to ${to}.`);
  else if (winPlayed >= 50) details.push(`You still have ${to}, but let some of it slip.`);
  else details.push(`You're still in ${to}, and it just got harder to hold.`);
  if (best) details.push(`Best was ${bestText}.`);
  return { headline, details };
}

