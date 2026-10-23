'use client';

import { useEffect, useRef, useState } from 'react';
import { loadOpeningBook, lookupOpening } from '@/lib/analysis/openings';
import { evalPoint, reviewMove, terminalEval } from '@/lib/analysis/review';
import type { Classification, MoveReview } from '@/lib/analysis/types';
import { AbortError, StockfishEngine, type SearchLimits } from '@/lib/engine/stockfish';
import type { PositionAnalysis } from '@/lib/engine/uci';
import type { PlyRecord } from '@/lib/games/pgn';
import { DEPTH_PRESETS, type AnalysisDepth } from '@/lib/settings';

/** Keep deepening while the user looks at a position, within reason for battery life. */
const LIVE_LIMITS: SearchLimits = { depth: 22, moveTimeMs: 15000, multiPv: 3 };

export const exploredKey = (ply: PlyRecord) => `${ply.fenBefore}|${ply.uci}`;

interface ExplorerArgs {
  /** The tried move currently on the board, or null when on the game's moves. */
  ply: PlyRecord | null;
  prevPly?: PlyRecord;
  prevClassification?: Classification;
  /** Analyses the game review already has, by FEN. */
  known: Map<string, PositionAnalysis>;
  depth: AnalysisDepth;
  perspective?: 'w' | 'b';
}

/**
 * Analyses moves the user tries on the board with a dedicated Stockfish
 * worker. Each new position is first searched to the review's depth so the
 * tried move is classified exactly like the game's moves, then the search
 * keeps deepening for the live engine display.
 */
export function useExplorer({ ply, prevPly, prevClassification, known, depth, perspective }: ExplorerArgs) {
  const engineRef = useRef<StockfishEngine | null>(null);
  const snapshots = useRef(new Map<string, PositionAnalysis>());
  const [live, setLive] = useState<PositionAnalysis | null>(null);
  const [reviews, setReviews] = useState<Record<string, MoveReview>>({});
  const context = useRef({ prevPly, prevClassification, known, perspective });

  useEffect(() => {
    context.current = { prevPly, prevClassification, known, perspective };
  });

  useEffect(() => () => engineRef.current?.terminate(), []);

  const fenAfter = ply?.fenAfter;
  const uci = ply?.uci;

  useEffect(() => {
    if (!ply) return;
    let cancelled = false;
    const engine = (engineRef.current ??= new StockfishEngine());
    const preset = DEPTH_PRESETS[depth];
    const lookup = (fen: string) => snapshots.current.get(fen) ?? context.current.known.get(fen) ?? null;

    const classify = async () => {
      const key = exploredKey(ply);
      const before = lookup(ply.fenBefore);
      const after = lookup(ply.fenAfter);
      if (!before || !after) return;
      const book = await loadOpeningBook();
      const ctx = context.current;
      const prevBefore = ctx.prevPly ? lookup(ctx.prevPly.fenBefore) : null;
      const review = reviewMove({
        ply,
        index: ply.index,
        before,
        after,
        prevPly: ctx.prevPly,
        prevClassification: ctx.prevClassification,
        prevMoverEval: prevBefore ? evalPoint(prevBefore) : null,
        isBook: !!lookupOpening(book, ply.fenAfter),
        book,
        perspective: ctx.perspective,
      });
      if (!cancelled) setReviews((r) => (r[key] ? r : { ...r, [key]: review }));
    };

    const run = async () => {
      // The position before the move needs a review-quality search too.
      if (!lookup(ply.fenBefore)) {
        const before = await engine.analyse(ply.fenBefore, preset);
        snapshots.current.set(ply.fenBefore, before);
      }
      if (cancelled) return;

      if (terminalEval(ply.fenAfter)) {
        const result = { fen: ply.fenAfter, depth: 0, lines: [] };
        snapshots.current.set(ply.fenAfter, result);
        setLive(result);
        await classify();
        return;
      }

      void classify();
      const started = performance.now();
      let lastEmit = 0;
      const final = await engine.analyse(ply.fenAfter, LIVE_LIMITS, (partial) => {
        if (cancelled || partial.lines.length === 0) return;
        const elapsed = performance.now() - started;
        if (!snapshots.current.has(ply.fenAfter) && (partial.depth >= preset.depth || elapsed >= preset.moveTimeMs)) {
          snapshots.current.set(ply.fenAfter, partial);
          void classify();
        }
        if (elapsed - lastEmit > 150) {
          lastEmit = elapsed;
          setLive(partial);
        }
      });
      if (cancelled) return;
      if (!snapshots.current.has(ply.fenAfter)) snapshots.current.set(ply.fenAfter, final);
      setLive(final);
      await classify();
    };

    run().catch((err) => {
      if (!(err instanceof AbortError)) console.error(err);
    });
    return () => {
      cancelled = true;
      engine.cancel();
    };
    // Re-run only when the position on the board changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fenAfter, uci, depth]);

  return {
    /** Live engine output for the tried position on the board (null until the first result). */
    live: live && live.fen === fenAfter ? live : null,
    reviewOf: (p: PlyRecord | null | undefined) => (p ? (reviews[exploredKey(p)] ?? null) : null),
  };
}
