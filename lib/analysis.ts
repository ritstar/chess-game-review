import { Chess } from 'chess.js';
import { Evaluation } from '@/lib/stockfish';

export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'book'
  | 'forced'
  | null;

export interface ParsedMove {
  index: number;
  ply: number;
  san: string;
  lan: string;
  fenBefore: string;
  fenAfter: string;
  turn: 'w' | 'b';
}

export interface MoveAnalysis {
  evaluation: Evaluation;
  bestMove: string;
  playedMove: string;
  centipawnLoss: number;
  classification: MoveClassification;
}

/* ── helpers ─────────────────────────────────────── */

const PIECE_VALUE: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

function materialByColor(fen: string): { white: number; black: number } {
  const board = new Chess(fen).board();
  let white = 0;
  let black = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUE[piece.type] ?? 0;
      if (piece.color === 'w') white += value;
      else black += value;
    }
  }
  return { white, black };
}

/** Count legal moves from a FEN position */
function countLegalMoves(fen: string): number {
  try {
    const g = new Chess(fen);
    return g.moves().length;
  } catch {
    return 20; // fallback
  }
}

/**
 * Convert evaluation to centipawns from the side-to-move perspective.
 * Mate scores are mapped to large centipawn values.
 */
export function evalToCpFromTurnPerspective(evalData: Evaluation): number {
  if (typeof evalData.mate === 'number') {
    const sign = Math.sign(evalData.mate);
    const distance = Math.max(1, Math.abs(evalData.mate));
    return sign * (10000 - distance * 10);
  }
  return evalData.cp ?? 0;
}

/**
 * Win-chance from White's perspective (0-100 scale).
 * Uses Chess.com's win-chance formula: 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)
 */
export function winChance(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/* ── PGN parsing ─────────────────────────────────── */

export function parsePgnMoves(pgn: string): ParsedMove[] {
  const game = new Chess();
  game.loadPgn(pgn);
  const verbose = game.history({ verbose: true });

  const replay = new Chess();
  const parsed: ParsedMove[] = [];

  verbose.forEach((move, index) => {
    const fenBefore = replay.fen();
    const turn = replay.turn();
    replay.move(move);

    parsed.push({
      index,
      ply: index + 1,
      san: move.san,
      lan: move.lan,
      fenBefore,
      fenAfter: replay.fen(),
      turn,
    });
  });

  return parsed;
}

/* ── Move classification (Chess.com style) ───────── */

export function classifyMove(params: {
  move: ParsedMove;
  evalBefore: Evaluation;        // eval of position BEFORE the move (from mover's perspective)
  evalAfter: Evaluation;         // eval of position AFTER the move (from opponent's perspective)
  bestMove: string;              // engine's best move in LAN
  openingPlyLimit: number;
  secondBestEval?: Evaluation | null; // eval if second-best move was played (for great detection)
  prevEvalBefore?: Evaluation | null; // eval before the previous move (opponent's turn)
  isOnlyLegalMove?: boolean;     // forced move
}): { classification: MoveClassification; centipawnLoss: number } {
  const {
    move,
    evalBefore,
    evalAfter,
    bestMove,
    openingPlyLimit,
    secondBestEval,
    isOnlyLegalMove,
  } = params;

  /* ── Checkmate / stalemate: if this move ends the game, it's always best ── */
  const isCheckmate = move.san.endsWith('#');
  if (isCheckmate) {
    return { classification: 'best', centipawnLoss: 0 };
  }

  // Check if the resulting position has no legal moves (stalemate)
  try {
    const after = new Chess(move.fenAfter);
    if (after.isGameOver()) {
      return { classification: 'best', centipawnLoss: 0 };
    }
  } catch {
    // ignore
  }

  /* ── Compute centipawn loss ── */
  // evalBefore is from side-to-move's perspective (positive = good for mover)
  // evalAfter is from NEW side-to-move's perspective (positive = good for opponent)
  const scoreBefore = evalToCpFromTurnPerspective(evalBefore);
  const scoreAfter = -evalToCpFromTurnPerspective(evalAfter); // negate to get from mover's perspective
  const cpl = Math.max(0, scoreBefore - scoreAfter);

  const isBest = move.lan === bestMove;

  /* ── Forced move ── */
  if (isOnlyLegalMove) {
    return { classification: 'forced', centipawnLoss: 0 };
  }

  /* ── Book moves ── */
  if (move.ply <= openingPlyLimit && cpl <= 25) {
    return { classification: 'book', centipawnLoss: cpl };
  }

  /* ── Blunder detection (win-chance based) ── */
  const wcBefore = winChance(scoreBefore);
  const wcAfter = winChance(scoreAfter);
  // Win-chance loss from mover's perspective
  const wcLoss = wcBefore - wcAfter;

  /* ── Classify by CPL thresholds ── */
  let classification: MoveClassification;

  if (cpl > 250 || wcLoss > 30) {
    classification = 'blunder';
    // Don't call it a blunder if position was already totally lost (eval < -500cp)
    if (scoreBefore < -500) {
      if (cpl <= 100) classification = 'good';
      else if (cpl <= 250) classification = 'mistake';
    }
  } else if (cpl > 100 || wcLoss > 20) {
    classification = 'mistake';
    if (scoreBefore < -400 && cpl <= 150) classification = 'inaccuracy';
  } else if (cpl > 30 || wcLoss > 10) {
    classification = 'inaccuracy';
  } else if (cpl > 10) {
    classification = 'good';
  } else if (cpl > 0) {
    classification = 'excellent';
  } else {
    classification = isBest ? 'best' : 'excellent';
  }

  // If player played the best move, it's at least "best"
  if (isBest && cpl <= 10) {
    classification = 'best';
  }

  /* ── Brilliant detection ── */
  // A move is brilliant if:
  // 1. It involves a material sacrifice (piece left en prise or exchange sacrifice)
  // 2. It is the best or near-best move (cpl <= 15)
  // 3. Position was not already totally winning (scoreBefore < 600)
  // 4. The sacrifice wasn't recaptured immediately (material actually lost)
  const beforeMaterial = materialByColor(move.fenBefore);
  const afterMaterial = materialByColor(move.fenAfter);
  const moverColor = move.turn;
  const moverBefore = moverColor === 'w' ? beforeMaterial.white : beforeMaterial.black;
  const moverAfter = moverColor === 'w' ? afterMaterial.white : afterMaterial.black;
  const opponentBefore = moverColor === 'w' ? beforeMaterial.black : beforeMaterial.white;
  const opponentAfter = moverColor === 'w' ? afterMaterial.black : afterMaterial.white;
  const materialSacrificed = moverBefore - moverAfter;
  const materialCaptured = opponentBefore - opponentAfter;
  const netSacrifice = materialSacrificed - materialCaptured;

  if (
    isBest &&
    netSacrifice >= 2 &&
    cpl <= 15 &&
    scoreBefore < 600 &&
    scoreBefore > -300 &&
    scoreAfter > -50
  ) {
    classification = 'brilliant';
  }

  /* ── Great move detection ── */
  // A move is great if:
  // 1. It is the best move (cpl <= 10)
  // 2. The second-best move is significantly worse (delta ≥ 150cp)
  // 3. Not already classified as brilliant
  if (
    classification !== 'brilliant' &&
    isBest &&
    cpl <= 10 &&
    secondBestEval
  ) {
    const secondBestScore = -evalToCpFromTurnPerspective(secondBestEval);
    const delta = secondBestScore - scoreAfter; // how much worse is second best
    // If second best is 150+ cp worse, this was a "great" find
    if (delta >= 150 && scoreBefore > -200) {
      classification = 'great';
    }
  }

  return { classification, centipawnLoss: Math.round(cpl) };
}
