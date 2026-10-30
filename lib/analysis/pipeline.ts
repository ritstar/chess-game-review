import type { EnginePool, SearchJob } from '@/lib/engine/stockfish';
import { scoreToCp, type PositionAnalysis } from '@/lib/engine/uci';
import type { PlyRecord } from '@/lib/games/pgn';
import type { AnalysisPreset } from '@/lib/settings';
import type { OpeningBook } from './openings';
import { BANDS, GREAT_GAP, buildReview, terminalEval } from './review';
import type { GameReview } from './types';
import { winPercent } from './winning';

export type AnalysisStage = 'search' | 'deep';

export interface GameAnalysisInput {
  plies: PlyRecord[];
  startFen: string;
  pool: EnginePool;
  preset: AnalysisPreset;
  book: OpeningBook;
  perspective?: 'w' | 'b';
  signal?: AbortSignal;
  /** Fires whenever a position's analysis lands. `progress` is 0–1 over both passes. */
  onProgress?: (positions: (PositionAnalysis | null)[], progress: number, stage: AnalysisStage) => void;
}

/** Share of the progress bar the first pass fills. */
const FIRST_PASS_SHARE = 0.75;

/**
 * Analyse a whole game in two passes, the way a server-side review would:
 *
 * 1. Every position gets a deterministic MultiPV search, and the move played
 *    from it is scored inside the same search tree when it isn't one of the
 *    engine's candidates. Comparing best and played moves within one search
 *    (rather than against a separate search of the next position) is what
 *    keeps "Best", "Excellent" and "Inaccuracy" honest.
 * 2. The moves that decide the review – mistakes, blunders, misses, great and
 *    brilliant candidates, and anything sitting on a classification boundary –
 *    are searched again much deeper before the review is final.
 */
export async function analyseGame(input: GameAnalysisInput): Promise<PositionAnalysis[]> {
  const { plies, startFen, pool, preset, signal, onProgress } = input;
  const fens = [startFen, ...plies.map((p) => p.fenAfter)];
  // Game-over positions need no engine.
  const positions: (PositionAnalysis | null)[] = fens.map((fen) =>
    terminalEval(fen) ? { fen, depth: 0, lines: [] } : null,
  );

  const jobsFor = (indices: number[], limits: AnalysisPreset['search']): SearchJob[] =>
    indices.map((i) => ({ fen: fens[i], limits, played: plies[i]?.uci }));

  // Pass 1.
  const todo = fens.map((_, i) => i).filter((i) => !positions[i]);
  let done = 0;
  await pool.analyseAll(
    jobsFor(todo, preset.search),
    (j, result) => {
      positions[todo[j]] = compact(result);
      done++;
      onProgress?.(positions, (FIRST_PASS_SHARE * done) / Math.max(1, todo.length), 'search');
    },
    signal,
  );

  // Pass 2.
  const first = buildReview(plies, positions, input.book, undefined, input.perspective);
  const targets = deepCheckTargets(first, preset.deepMoves);
  // Ratings come from the position before each move (best and played move
  // scored in one search), so that is the search worth deepening.
  const deep = targets.filter((i) => !terminalEval(fens[i])).sort((a, b) => a - b);
  let deepDone = 0;
  onProgress?.(positions, FIRST_PASS_SHARE, 'deep');
  await pool.analyseAll(
    jobsFor(deep, preset.deep),
    (j, result) => {
      positions[deep[j]] = compact(result);
      deepDone++;
      onProgress?.(positions, FIRST_PASS_SHARE + ((1 - FIRST_PASS_SHARE) * deepDone) / deep.length, 'deep');
    },
    signal,
  );
  return positions as PositionAnalysis[];
}

/** Keep stored analyses small: long PVs are only shown truncated anyway. */
function compact(p: PositionAnalysis): PositionAnalysis {
  const trim = <T extends { pv: string[] }>(l: T): T => ({ ...l, pv: l.pv.slice(0, 14) });
  return { ...p, lines: p.lines.map(trim), ...(p.played ? { played: trim(p.played) } : {}) };
}

/**
 * Moves worth a deeper second search, most important first: every error,
 * every great/brilliant candidate, and moves whose rating could flip with a
 * slightly different score.
 */
export function deepCheckTargets(review: GameReview, max: number): number[] {
  const scored: { index: number; priority: number }[] = [];
  review.moves.forEach((m, i) => {
    if (!m || m.classification === 'book' || m.classification === 'forced') return;
    let priority = 0;
    switch (m.classification) {
      case 'brilliant':
      case 'great':
        priority = 100;
        break;
      case 'blunder':
      case 'miss':
      case 'mistake':
      case 'inaccuracy':
        priority = 50 + m.winLoss;
        break;
      default: {
        const nearest = Math.min(...BANDS.map((b) => Math.abs(m.winLoss - b)));
        if (m.winLoss > 0.5 && nearest < 1.5) priority = 20 - nearest * 10;
        // A best move that nearly qualifies as "great".
        const before = review.positions[i];
        if (m.classification === 'best' && before?.lines[1]) {
          // Lines are scored from the mover's point of view.
          const gap = winPercent(scoreToCp(before.lines[0].score)) - winPercent(scoreToCp(before.lines[1].score));
          if (Math.abs(gap - GREAT_GAP) < 4) priority = Math.max(priority, 30);
        }
      }
    }
    if (priority > 0) scored.push({ index: i, priority });
  });
  return scored
    .sort((a, b) => b.priority - a.priority)
    .slice(0, max)
    .map((s) => s.index);
}
