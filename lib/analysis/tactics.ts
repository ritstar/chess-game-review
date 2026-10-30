import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** Material balance (White minus Black) in pawns. */
export function materialBalance(fen: string): number {
  let total = 0;
  for (const row of new Chess(fen).board()) {
    for (const p of row) if (p) total += (p.color === 'w' ? 1 : -1) * PIECE_VALUE[p.type];
  }
  return total;
}

function captures(chess: Chess, square: Square): Move[] {
  // Only pieces that attack the square can capture on it; generating just
  // their moves (legality still checked) is far cheaper than every move.
  const out: Move[] = [];
  for (const from of chess.attackers(square, chess.turn())) {
    for (const m of chess.moves({ square: from, verbose: true })) if (m.to === square && m.captured) out.push(m);
  }
  return out;
}

/**
 * Static exchange evaluation: material the side to move wins by starting a
 * capture sequence on `square`, always recapturing with the least valuable
 * piece and stopping whenever continuing would lose material. Uses real legal
 * moves, so pins and checks are respected.
 */
export function staticExchange(fen: string, square: Square): number {
  const chess = new Chess(fen);
  const target = chess.get(square);
  if (!target) return 0;

  const swap = (depth: number): number => {
    if (depth > 12) return 0;
    const victim = chess.get(square);
    const options = captures(chess, square);
    if (!victim || options.length === 0) return 0;
    options.sort((a, b) => PIECE_VALUE[a.piece] - PIECE_VALUE[b.piece]);
    const m = options[0];
    chess.move(m);
    // King captures are only legal if the square isn't defended, so the
    // opponent's reply can't recapture – handled naturally by legality.
    const gain = PIECE_VALUE[victim.type] - swap(depth + 1);
    chess.undo();
    return Math.max(0, gain);
  };

  return swap(0);
}

export interface HangingPiece {
  square: Square;
  piece: PieceSymbol;
  /** Material the opponent nets by taking it. */
  loss: number;
}

/**
 * Pieces of `color` that the side to move (the opponent) can win material
 * against in the given position. `fen` must have the opponent to move.
 */
export function hangingPieces(fen: string, color: 'w' | 'b'): HangingPiece[] {
  const chess = new Chess(fen);
  if (chess.turn() === color) return [];
  const result: HangingPiece[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      if (!chess.isAttacked(p.square, chess.turn())) continue;
      const loss = staticExchange(fen, p.square);
      if (loss > 0) result.push({ square: p.square, piece: p.type, loss });
    }
  }
  return result.sort((a, b) => b.loss - a.loss);
}

/**
 * Whether `move` (just played, leading to `fenAfter`) sacrifices material:
 * the opponent can now win at least `threshold` pawns' worth that they
 * couldn't before. Pawn-only sacrifices are ignored by default.
 */
export function sacrificedMaterial(fenBefore: string, fenAfter: string, mover: 'w' | 'b'): HangingPiece | null {
  const hanging = hangingPieces(fenAfter, mover).filter((h) => h.piece !== 'p');
  if (!hanging.length) return null;
  // What the opponent could already grab before the move (if it were their turn).
  const flipped = flipTurn(fenBefore);
  const alreadyHanging = new Map((flipped ? hangingPieces(flipped, mover) : []).map((h) => [h.square, h.loss]));

  // Material gained by the mover on this move offsets what they leave hanging.
  const gained = Math.abs(materialBalance(fenAfter) - materialBalance(fenBefore));

  for (const h of hanging) {
    if (h.piece === 'p') continue;
    const net = h.loss - gained;
    if (net >= 2 && (alreadyHanging.get(h.square) ?? 0) < h.loss) return { ...h, loss: net };
  }
  return null;
}

/** Same position with the other side to move, or null if that's illegal (side not to move in check). */
export function flipTurn(fen: string): string | null {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    const c = new Chess(parts.join(' '));
    return c.fen();
  } catch {
    return null;
  }
}

/** Convert a UCI move list to SAN starting from `fen`, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uci: string[], limit = uci.length): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const m of uci.slice(0, limit)) {
    try {
      out.push(chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Net material change for `color` (in pawns) after playing out a line.
 * The line is extended past `plies` while it's still mid-exchange, and a
 * capture left hanging at the end is resolved with static exchange, so a
 * half-finished trade isn't mistaken for a material swing.
 */
export function materialSwing(fen: string, uci: string[], color: 'w' | 'b', plies = 6): number {
  const chess = new Chess(fen);
  const start = materialBalance(fen);
  let last: Move | null = null;
  for (let i = 0; i < uci.length && i < plies + 4; i++) {
    if (i >= plies && !last?.captured) break;
    const m = uci[i];
    try {
      last = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    } catch {
      break;
    }
  }
  let end = materialBalance(chess.fen());
  if (last?.captured) {
    const recapture = staticExchange(chess.fen(), last.to);
    end += chess.turn() === 'w' ? recapture : -recapture;
  }
  const diff = end - start;
  return color === 'w' ? diff : -diff;
}

export interface Fork {
  square: Square;
  piece: PieceSymbol;
  targets: { square: Square; piece: PieceSymbol }[];
}

/**
 * Whether the move `uci` (played in `fen`) forks: the moved piece attacks two
 * or more enemy pieces that are the king or worth more than itself, or are
 * undefended.
 */
export function detectFork(fen: string, uci: string): Fork | null {
  const chess = new Chess(fen);
  let move: Move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
  const attacker = move.promotion ?? move.piece;
  const victim = move.color === 'w' ? 'b' : 'w';
  // A forking piece that can simply be taken isn't forking anything.
  if (staticExchange(chess.fen(), move.to) > 0) return null;
  const targets: Fork['targets'] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== victim) continue;
      if (!chess.attackers(p.square, move.color).includes(move.to)) continue;
      const valuable = p.type === 'k' || PIECE_VALUE[p.type] > PIECE_VALUE[attacker];
      const loose = !chess.isAttacked(p.square, victim) && p.type !== 'p';
      if (valuable || loose) targets.push({ square: p.square, piece: p.type });
    }
  }
  return targets.length >= 2 ? { square: move.to, piece: attacker, targets } : null;
}

/**
 * Pieces the moved piece now attacks that matter: worth more than the
 * attacker, or undefended. A single target means a threat (often gaining a
 * tempo); two or more is a fork, see {@link detectFork}.
 */
export function detectThreats(fen: string, uci: string): Fork | null {
  const chess = new Chess(fen);
  let move: Move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
  const attacker = move.promotion ?? move.piece;
  const victim = move.color === 'w' ? 'b' : 'w';
  // A piece that can simply be taken for free isn't threatening anything.
  if (staticExchange(chess.fen(), move.to) >= PIECE_VALUE[attacker] && attacker !== 'p') return null;
  const targets: Fork['targets'] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== victim || p.type === 'k') continue;
      if (!chess.attackers(p.square, move.color).includes(move.to)) continue;
      const valuable = PIECE_VALUE[p.type] > PIECE_VALUE[attacker];
      const loose = !chess.isAttacked(p.square, victim) && p.type !== 'p';
      if (valuable || loose) targets.push({ square: p.square, piece: p.type });
    }
  }
  return targets.length ? { square: move.to, piece: attacker, targets } : null;
}
