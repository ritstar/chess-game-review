import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import {
  PIECE_NAME,
  PIECE_VALUE,
  detectFork,
  detectThreats,
  flipTurn,
  hangingPieces,
  materialBalance,
  staticExchange,
} from './tactics';

/**
 * What a single move does on the board, in the terms a coach would use:
 * tactics first (mate, forks, pins), then material (free pieces, trades),
 * then plans (development, castling, passed pawns). Pure board logic, no
 * engine: callers decide which ideas are worth saying.
 */
export type Idea =
  | { kind: 'mate' }
  | { kind: 'promotion'; piece: PieceSymbol }
  | { kind: 'mateThreat'; san: string }
  | { kind: 'fork'; targets: { square: Square; piece: PieceSymbol }[] }
  | { kind: 'doubleCheck' }
  | { kind: 'discoveredCheck' }
  | { kind: 'discoveredAttack'; target: { square: Square; piece: PieceSymbol } }
  | { kind: 'pin'; pinned: { square: Square; piece: PieceSymbol }; behind: PieceSymbol }
  | { kind: 'skewer'; front: { square: Square; piece: PieceSymbol }; behind: { square: Square; piece: PieceSymbol } }
  | { kind: 'freePiece'; piece: PieceSymbol; square: Square }
  | { kind: 'winsExchange' }
  | { kind: 'recapture'; piece: PieceSymbol }
  | { kind: 'trade'; piece: PieceSymbol; ahead: boolean }
  | { kind: 'capture'; piece: PieceSymbol }
  | { kind: 'threat'; target: { square: Square; piece: PieceSymbol } }
  | { kind: 'rescue'; piece: PieceSymbol; square: Square }
  | { kind: 'defend'; piece: PieceSymbol; square: Square }
  | { kind: 'castle'; side: 'king' | 'queen' }
  | { kind: 'develop'; piece: PieceSymbol }
  | { kind: 'center' }
  | { kind: 'fianchetto' }
  | { kind: 'passedPawn'; square: Square }
  | { kind: 'openFile'; file: string; semi: boolean }
  | { kind: 'activeKing' }
  | { kind: 'check' }
  | { kind: 'losesCastling' }
  | { kind: 'weakensKing' };

export interface IdeaContext {
  /** The opponent's previous move, for recaptures. */
  prevMove?: { to: string; captured?: string };
}

const FILES = 'abcdefgh';
const DIAGONAL: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const STRAIGHT: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const sq = (file: number, rank: number) => `${FILES[file]}${rank + 1}` as Square;
const coords = (s: string) => [FILES.indexOf(s[0]), Number(s[1]) - 1] as const;

function play(fen: string, uci: string): { chess: Chess; move: Move } | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { chess, move };
  } catch {
    return null;
  }
}

/** Non-pawn, non-king material of one side. */
function pieceMaterial(chess: Chess, color: 'w' | 'b'): number {
  let total = 0;
  for (const row of chess.board()) for (const p of row) if (p?.color === color && p.type !== 'p') total += PIECE_VALUE[p.type];
  return total;
}

/** Queens off or little material left: the king should come out. */
export function isEndgame(fen: string): boolean {
  const chess = new Chess(fen);
  const w = pieceMaterial(chess, 'w');
  const b = pieceMaterial(chess, 'b');
  const queens = chess.findPiece({ type: 'q', color: 'w' }).length + chess.findPiece({ type: 'q', color: 'b' }).length;
  return w + b <= 26 && (queens === 0 || w + b <= 18);
}

const fullMove = (fen: string) => Number(fen.split(' ')[5]) || 1;

/** Line pieces of `color` looking through `from` along a ray: pins and skewers along that ray. */
function rayTargets(chess: Chess, from: Square, dirs: [number, number][], enemy: 'w' | 'b') {
  const hits: { first: { square: Square; piece: PieceSymbol }; second?: { square: Square; piece: PieceSymbol } }[] = [];
  const [f0, r0] = coords(from);
  for (const [df, dr] of dirs) {
    let f = f0 + df;
    let r = r0 + dr;
    let first: { square: Square; piece: PieceSymbol } | null = null;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const p = chess.get(sq(f, r));
      if (p) {
        if (p.color !== enemy) break;
        if (!first) first = { square: sq(f, r), piece: p.type };
        else {
          hits.push({ first, second: { square: sq(f, r), piece: p.type } });
          first = null;
          break;
        }
      }
      f += df;
      r += dr;
    }
    if (first) hits.push({ first });
  }
  return hits;
}

/** Everything notable about `uci` played in `fen`, most important first. */
export function moveIdeas(fen: string, uci: string, ctx: IdeaContext = {}): Idea[] {
  const played = play(fen, uci);
  if (!played) return [];
  const { chess, move } = played;
  const mover = move.color;
  const enemy = mover === 'w' ? 'b' : 'w';
  const piece = move.promotion ?? move.piece;
  const ideas: Idea[] = [];
  const fenAfter = chess.fen();

  if (chess.isCheckmate()) return [{ kind: 'mate' }];
  if (move.promotion) ideas.push({ kind: 'promotion', piece: move.promotion });

  // Checks: double and discovered checks are the dangerous ones.
  if (chess.inCheck()) {
    const king = chess.findPiece({ type: 'k', color: enemy })[0];
    const checkers = king ? chess.attackers(king, mover) : [];
    if (checkers.length >= 2) ideas.push({ kind: 'doubleCheck' });
    else if (checkers.length === 1 && checkers[0] !== move.to) ideas.push({ kind: 'discoveredCheck' });
  }

  // A mate threat: if the opponent did nothing, mate would follow.
  if (!chess.inCheck()) {
    const flipped = flipTurn(fenAfter);
    if (flipped) {
      const threat = new Chess(flipped).moves({ verbose: true }).find((m) => m.san.endsWith('#'));
      if (threat) ideas.push({ kind: 'mateThreat', san: threat.san });
    }
  }

  const fork = detectFork(fen, uci);
  if (fork) {
    const worth = (p: PieceSymbol) => (p === 'k' ? 100 : PIECE_VALUE[p]);
    ideas.push({ kind: 'fork', targets: [...fork.targets].sort((a, b) => worth(b.piece) - worth(a.piece)) });
  }

  // Pins and skewers by the piece that moved.
  if (piece === 'b' || piece === 'r' || piece === 'q') {
    const dirs = piece === 'b' ? DIAGONAL : piece === 'r' ? STRAIGHT : [...DIAGONAL, ...STRAIGHT];
    for (const { first, second } of rayTargets(chess, move.to, dirs, enemy)) {
      if (!second) continue;
      const v1 = first.piece === 'k' ? 100 : PIECE_VALUE[first.piece];
      const v2 = second.piece === 'k' ? 100 : PIECE_VALUE[second.piece];
      if (first.piece !== 'p' && first.piece !== 'k' && v2 > v1 && v1 <= PIECE_VALUE[piece] + 2) {
        // Only worth mentioning if the pinned piece can't simply be defended away.
        ideas.push({ kind: 'pin', pinned: first, behind: second.piece });
        break;
      }
      if (v1 > v2 && second.piece !== 'p' && (first.piece === 'k' || first.piece === 'q') && v1 > PIECE_VALUE[piece]) {
        ideas.push({ kind: 'skewer', front: first, behind: second });
        break;
      }
    }
  }

  // Discovered attacks on the queen by a piece the move unmasked.
  if (!ideas.some((i) => i.kind === 'discoveredCheck' || i.kind === 'doubleCheck')) {
    const queen = chess.findPiece({ type: 'q', color: enemy })[0];
    if (queen) {
      const before = new Chess(fen).attackers(queen, mover);
      const now = chess.attackers(queen, mover).filter((s) => s !== move.to && !before.includes(s));
      const attacker = now.map((s) => chess.get(s)).find((p) => p && PIECE_VALUE[p.type] < PIECE_VALUE.q);
      if (attacker) ideas.push({ kind: 'discoveredAttack', target: { square: queen, piece: 'q' } });
    }
  }

  // Material.
  if (move.captured) {
    const victim = move.captured;
    const backAgain = staticExchange(fenAfter, move.to);
    const net = PIECE_VALUE[victim] - backAgain;
    const recapture = ctx.prevMove?.captured && ctx.prevMove.to === move.to;
    if (recapture && net >= 0) ideas.push({ kind: 'recapture', piece: victim });
    else if (backAgain === 0 && victim !== 'p' && !chess.isAttacked(move.to, enemy)) ideas.push({ kind: 'freePiece', piece: victim, square: move.to });
    else if (backAgain === 0 && net >= 1) ideas.push({ kind: 'freePiece', piece: victim, square: move.to });
    else if (victim === 'r' && (move.piece === 'n' || move.piece === 'b') && net >= 1) ideas.push({ kind: 'winsExchange' });
    else if (victim === move.piece && net <= 0 && backAgain > 0) {
      const ahead = (mover === 'w' ? 1 : -1) * materialBalance(fen) >= 2;
      ideas.push({ kind: 'trade', piece: victim, ahead });
    } else if (net >= 0) ideas.push({ kind: 'capture', piece: victim });
  }

  if (!fork) {
    const threat = detectThreats(fen, uci);
    const target = threat?.targets[0];
    if (target && !ideas.some((i) => i.kind === 'pin' || i.kind === 'skewer')) ideas.push({ kind: 'threat', target });
  }

  // Saving a piece that was under attack.
  const flippedBefore = flipTurn(fen);
  if (flippedBefore && !new Chess(fen).inCheck()) {
    const was = hangingPieces(flippedBefore, mover).filter((h) => h.loss >= 2);
    if (was.length) {
      const still = new Set(hangingPieces(fenAfter, mover).map((h) => h.square));
      const moved = was.find((h) => h.square === move.from);
      // When the move captures, taking something is the headline and saving the piece a side effect.
      if (moved && !move.captured && !still.has(move.to)) ideas.push({ kind: 'rescue', piece: moved.piece, square: move.to });
      else {
        const defended = was.find((h) => h.square !== move.from && !still.has(h.square) && chess.get(h.square)?.color === mover);
        if (defended && !move.captured) ideas.push({ kind: 'defend', piece: defended.piece, square: defended.square });
      }
    }
  }

  // Plans.
  const opening = fullMove(fen) <= 14 && !isEndgame(fen);
  const backRank = mover === 'w' ? '1' : '8';
  if (move.san.startsWith('O-O')) ideas.push({ kind: 'castle', side: move.san === 'O-O' ? 'king' : 'queen' });
  else if (opening && (move.piece === 'n' || move.piece === 'b') && move.from[1] === backRank && !move.captured)
    ideas.push({ kind: 'develop', piece: move.piece });
  if (opening && move.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(move.to)) ideas.push({ kind: 'center' });
  if (opening && move.piece === 'b' && ['g2', 'b2', 'g7', 'b7'].includes(move.to)) {
    const develop = ideas.findIndex((i) => i.kind === 'develop');
    if (develop >= 0) ideas.splice(develop, 1);
    ideas.push({ kind: 'fianchetto' });
  }

  if (move.piece === 'p' && !move.promotion && isPassed(chess, move.to, mover)) {
    const rank = Number(move.to[1]);
    if ((mover === 'w' ? rank : 9 - rank) >= 5) ideas.push({ kind: 'passedPawn', square: move.to });
  }
  if (move.piece === 'r' && move.from[0] !== move.to[0]) {
    const file = move.to[0];
    let own = 0;
    let theirs = 0;
    for (let r = 1; r <= 8; r++) {
      const p = chess.get(`${file}${r}` as Square);
      if (p?.type !== 'p') continue;
      if (p.color === mover) own++;
      else theirs++;
    }
    if (own === 0) ideas.push({ kind: 'openFile', file, semi: theirs > 0 });
  }
  if (move.piece === 'k' && !move.san.startsWith('O-O') && isEndgame(fen)) {
    const center = (s: string) => {
      const [f, r] = coords(s);
      return Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
    };
    if (center(move.to) < center(move.from)) ideas.push({ kind: 'activeKing' });
  }
  if (move.piece === 'k' && !move.san.startsWith('O-O') && !isEndgame(fen)) {
    const rights = fen.split(' ')[2];
    if (mover === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights)) ideas.push({ kind: 'losesCastling' });
  }
  if (move.piece === 'p' && !move.captured && !isEndgame(fen) && shieldsKing(fen, move.from, mover)) ideas.push({ kind: 'weakensKing' });

  if (move.san.includes('+') && !ideas.some((i) => i.kind === 'doubleCheck' || i.kind === 'discoveredCheck')) ideas.push({ kind: 'check' });
  return ideas;
}

function isPassed(chess: Chess, square: string, color: 'w' | 'b'): boolean {
  const [f, r] = coords(square);
  const dir = color === 'w' ? 1 : -1;
  for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
    for (let rr = r + dir; rr >= 0 && rr < 8; rr += dir) {
      const p = chess.get(sq(ff, rr));
      if (p?.type === 'p' && p.color !== color) return false;
    }
  }
  return true;
}

/** Whether a pawn on `from` stood in front of its own castled king. */
function shieldsKing(fen: string, from: string, color: 'w' | 'b'): boolean {
  const chess = new Chess(fen);
  const king = chess.findPiece({ type: 'k', color })[0];
  if (!king) return false;
  const [kf, kr] = coords(king);
  const [pf, pr] = coords(from);
  const homeRank = color === 'w' ? 0 : 7;
  const castled = kr === homeRank && (kf >= 5 || kf <= 2);
  return castled && Math.abs(pf - kf) <= 1 && Math.abs(pr - kr) <= 2 && pr !== kr;
}

/* ── Wording ────────────────────────────────────────────────────────── */

const name = (p: PieceSymbol) => PIECE_NAME[p];
const article = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a');

/**
 * One idea as a coach's clause, e.g. "pins the knight to the king". Written
 * for `own`/`theirs` possessives ("your"/"their"/"the") so the same idea
 * reads right for either player.
 */
export function ideaClause(idea: Idea, own: string, theirs: string): string | null {
  switch (idea.kind) {
    case 'mate':
      return 'delivers checkmate';
    case 'promotion':
      return `promotes to ${article(name(idea.piece))} ${name(idea.piece)}`;
    case 'mateThreat':
      return `threatens checkmate with ${idea.san}`;
    case 'fork':
      return `forks ${theirs} ${idea.targets.map((t) => name(t.piece)).join(' and ')}`;
    case 'doubleCheck':
      return 'gives a double check, so only the king can move';
    case 'discoveredCheck':
      return 'uncovers a discovered check';
    case 'discoveredAttack':
      return `uncovers an attack on ${theirs} queen`;
    case 'pin':
      return `pins ${theirs} ${name(idea.pinned.piece)} to the ${name(idea.behind)}`;
    case 'skewer':
      return `skewers ${theirs} ${name(idea.front.piece)} and ${name(idea.behind.piece)}`;
    case 'freePiece':
      return idea.piece === 'p' ? 'picks up a free pawn' : `takes a free ${name(idea.piece)}`;
    case 'winsExchange':
      return 'wins the exchange, a rook for a minor piece';
    case 'recapture':
      return `takes back the ${name(idea.piece)}`;
    case 'trade':
      return idea.ahead
        ? `trades ${name(idea.piece)}s, and trading down is how you convert a material lead`
        : `trades ${name(idea.piece)}s`;
    case 'capture':
      return `captures the ${name(idea.piece)}`;
    case 'threat':
      return `attacks ${theirs} ${name(idea.target.piece)} on ${idea.target.square}`;
    case 'rescue':
      return `moves ${own} ${name(idea.piece)} out of danger`;
    case 'defend':
      return `defends ${own} ${name(idea.piece)} on ${idea.square}`;
    case 'castle':
      return idea.side === 'king'
        ? 'castles, tucking the king away and connecting the rooks'
        : 'castles queenside, bringing the rook to the center';
    case 'develop':
      return `develops ${own} ${name(idea.piece)}`;
    case 'center':
      return 'claims space in the center';
    case 'fianchetto':
      return 'fianchettoes the bishop onto the long diagonal';
    case 'passedPawn':
      return `pushes ${own} passed pawn closer to promotion`;
    case 'openFile':
      return `puts the rook on the ${idea.semi ? 'half-open' : 'open'} ${idea.file}-file`;
    case 'activeKing':
      return 'activates the king, a fighting piece in the endgame';
    case 'check':
      return 'gives check';
    case 'losesCastling':
      return 'gives up the right to castle';
    case 'weakensKing':
      return `loosens the pawns in front of ${own} king`;
  }
}

/** Ideas that make a move worth praising (as opposed to side effects like checks). */
export const POSITIVE: Idea['kind'][] = [
  'mate',
  'promotion',
  'mateThreat',
  'fork',
  'doubleCheck',
  'discoveredCheck',
  'discoveredAttack',
  'pin',
  'skewer',
  'freePiece',
  'winsExchange',
  'recapture',
  'trade',
  'capture',
  'threat',
  'rescue',
  'defend',
  'castle',
  'develop',
  'center',
  'fianchetto',
  'passedPawn',
  'openFile',
  'activeKing',
];

/** Ideas that are usually the reason a move went wrong. */
export const NEGATIVE: Idea['kind'][] = ['losesCastling', 'weakensKing'];
