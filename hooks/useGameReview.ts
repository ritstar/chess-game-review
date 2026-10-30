'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildReview, type ReviewMemo } from '@/lib/analysis/review';
import { loadOpeningBook, type OpeningBook } from '@/lib/analysis/openings';
import type { GameReview } from '@/lib/analysis/types';
import { cacheGet, cacheSet } from '@/lib/cache';
import { analyseGame, type AnalysisStage } from '@/lib/analysis/pipeline';
import { AbortError, EnginePool } from '@/lib/engine/stockfish';
import type { PositionAnalysis } from '@/lib/engine/uci';
import { parseGame, type ParsedGame } from '@/lib/games/pgn';
import type { GameRecord } from '@/lib/games/types';
import { ANALYSIS_VERSION, DEPTH_PRESETS, type AnalysisDepth } from '@/lib/settings';

export type ReviewStatus = 'idle' | 'analyzing' | 'done' | 'error';

export interface ReviewState {
  parsed: ParsedGame | null;
  review: GameReview | null;
  status: ReviewStatus;
  /** 0–1 */
  progress: number;
  error: string | null;
  fromCache: boolean;
  /** Which pass is running: every position, or the deeper check of key moments. */
  stage: AnalysisStage;
}

export interface ReviewSummary {
  white: number | null;
  black: number | null;
}

export const summaryKey = (gameId: string) => `summary:${gameId}`;

/** A few bytes per reviewed game, so the game list can show accuracies. */
function saveSummary(gameId: string, review: GameReview) {
  return cacheSet<ReviewSummary>(summaryKey(gameId), { white: review.white.accuracy, black: review.black.accuracy });
}

/**
 * Parses a game, analyses every position with a pool of Stockfish workers and
 * streams a classified review back as results arrive. Finished reviews are
 * cached in IndexedDB.
 */
export function useGameReview(game: GameRecord | null, depth: AnalysisDepth, runId = 0): ReviewState {
  const poolRef = useRef<EnginePool | null>(null);
  const [state, setState] = useState<Omit<ReviewState, 'parsed'>>({
    review: null,
    status: 'idle',
    progress: 0,
    error: null,
    fromCache: false,
    stage: 'search',
  });

  const parsed = useMemo(() => {
    if (!game) return { game: null, error: null };
    try {
      return { game: parseGame(game.pgn), error: null };
    } catch (err) {
      return { game: null, error: err instanceof Error ? err.message : 'Could not read this game.' };
    }
  }, [game]);

  useEffect(() => () => poolRef.current?.terminate(), []);

  useEffect(() => {
    const plies = parsed.game?.plies;
    if (!game || !parsed.game || !plies) return;

    const controller = new AbortController();
    const fens = [parsed.game.startFen, ...plies.map((p) => p.fenAfter)];
    const key = `${game.id}:${depth}:v${ANALYSIS_VERSION}`;
    const memo: ReviewMemo = new Map();
    let book: OpeningBook = {};

    const run = async () => {
      setState({ review: null, status: 'analyzing', progress: 0, error: null, fromCache: false, stage: 'search' });
      book = await loadOpeningBook();
      if (controller.signal.aborted) return;

      const cached = runId === 0 ? await cacheGet<PositionAnalysis[]>(key) : null;
      if (controller.signal.aborted) return;
      if (cached && cached.length === fens.length) {
        const review = buildReview(plies, cached, book, undefined, game.perspective);
        setState({ review, status: 'done', progress: 1, error: null, fromCache: true, stage: 'deep' });
        void saveSummary(game.id, review);
        return;
      }

      // Re-render at most a few times per second while results stream in.
      let latest: { positions: (PositionAnalysis | null)[]; progress: number; stage: AnalysisStage } | null = null;
      let scheduled = false;
      const flush = () => {
        scheduled = false;
        if (controller.signal.aborted || !latest) return;
        const { positions, progress, stage } = latest;
        setState((s) => ({
          ...s,
          review: buildReview(plies, positions, book, memo, game.perspective),
          progress,
          stage,
        }));
      };

      poolRef.current ??= new EnginePool();
      const final = await analyseGame({
        plies,
        startFen: parsed.game.startFen,
        pool: poolRef.current,
        preset: DEPTH_PRESETS[depth],
        book,
        perspective: game.perspective,
        signal: controller.signal,
        onProgress: (positions, progress, stage) => {
          latest = { positions, progress, stage };
          if (!scheduled) {
            scheduled = true;
            setTimeout(flush, 250);
          }
        },
      });
      if (controller.signal.aborted) return;

      const review = buildReview(plies, final, book, memo, game.perspective);
      setState({ review, status: 'done', progress: 1, error: null, fromCache: false, stage: 'deep' });
      void cacheSet(key, final);
      void saveSummary(game.id, review);
    };

    run().catch((err) => {
      if (err instanceof AbortError || controller.signal.aborted) return;
      console.error(err);
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Analysis failed.',
      }));
    });

    return () => controller.abort();
  }, [game, parsed, depth, runId]);

  if (!game || !parsed.game) {
    return { parsed: null, review: null, status: parsed.error ? 'error' : 'idle', progress: 0, error: parsed.error, fromCache: false, stage: 'search' };
  }
  return { parsed: parsed.game, ...state };
}
