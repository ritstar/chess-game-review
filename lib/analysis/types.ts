import type { PhaseGrade } from './phases';
import type { PositionAnalysis, Score } from '@/lib/engine/uci';

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export const CLASSIFICATIONS: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  forced: 'Forced',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
};

/** An evaluated position, always from White's point of view. */
export interface EvalPoint {
  /** Centipawns, mate mapped to ±MATE_CP. */
  cp: number;
  /** Score for display (mate distances preserved). */
  score: Score;
  /** White's win probability, 0–100. */
  win: number;
  /** Game over in this position. */
  terminal?: 'checkmate' | 'stalemate' | 'draw';
}

export interface EngineLineView {
  /** Score from White's POV. */
  score: Score;
  san: string[];
  uci: string[];
  depth: number;
}

export interface Explanation {
  headline: string;
  details: string[];
}

export interface MoveReview {
  index: number;
  classification: Classification;
  /** Win% the mover gave up compared with the best move (0–100). */
  winLoss: number;
  /** Centipawns lost compared with the best move (mover's POV, capped). */
  cpLoss: number;
  /** Move accuracy 0–100. */
  accuracy: number;
  bestUci?: string;
  bestSan?: string;
  /** The engine's main line from the position before the move (SAN). */
  bestLine: string[];
  /** The opponent's best continuation after the played move (SAN). */
  replyLine: string[];
  explanation: Explanation;
}

export interface PlayerSummary {
  accuracy: number | null;
  acpl: number;
  counts: Record<Classification, number>;
}

export interface GameReview {
  /** Engine output for every position: index 0 is the start, i is after ply i. */
  positions: (PositionAnalysis | null)[];
  evals: (EvalPoint | null)[];
  moves: (MoveReview | null)[];
  white: PlayerSummary;
  black: PlayerSummary;
  opening?: { eco: string; name: string };
  /** Indices of the moves where the game turned. */
  keyMoments: number[];
  /** Opening / middlegame / endgame grades, once the review is complete. */
  phases: PhaseGrade[];
  complete: boolean;
}
