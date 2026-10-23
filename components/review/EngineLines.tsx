import { memo, useDeferredValue, useMemo } from 'react';
import { formatLine } from '@/lib/analysis/explain';
import { lineView } from '@/lib/analysis/review';
import { formatScore, type PositionAnalysis } from '@/lib/engine/uci';
import { cn } from '@/lib/utils';

/** The engine's top candidate lines for the position on the board. */
export const EngineLines = memo(function EngineLines({
  analysis: latest,
  onHover,
  onPlay,
  onOpen,
}: {
  analysis: PositionAnalysis | null;
  onHover?: (uci: string | null) => void;
  /** Play the line's first move on the board. */
  onPlay?: (uci: string) => void;
  /** Phone variant: just the top line on one row; tapping it calls this. */
  onOpen?: () => void;
}) {
  // Lower priority than the board: a step paints the move first, then the lines.
  const analysis = useDeferredValue(latest);
  // Converting lines to SAN replays them with chess.js; only redo it when the analysis changes.
  const views = useMemo(
    () =>
      analysis?.lines.map((line) => {
        const view = lineView(analysis, line, 10);
        return {
          line,
          view,
          short: formatLine(analysis.fen, view.san, 10),
          long: formatLine(analysis.fen, view.san, 20),
        };
      }) ?? [],
    [analysis],
  );

  if (onOpen) {
    const top = views[0];
    return (
      <button type="button" onClick={onOpen} className="flex h-7 w-full items-center gap-2 px-3 text-left" aria-label="Engine lines">
        {top ? (
          <>
            <span
              className={cn(
                'w-12 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[11.5px] font-bold',
                (top.view.score.mate !== undefined ? Math.sign(top.view.score.mate) : (top.view.score.cp ?? 0)) >= 0
                  ? 'bg-[#f2f2f2] text-[#2a2825]'
                  : 'bg-[#403d39] text-[#f2f2f2]',
              )}
            >
              {formatScore(top.view.score)}
            </span>
            <span className="truncate font-mono text-[12px] text-muted">{top.short}</span>
          </>
        ) : (
          <span className="text-[12px] text-subtle">{analysis && analysis.lines.length === 0 ? 'Game over' : 'Engine thinking…'}</span>
        )}
      </button>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-1.5 px-3 py-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-5" />
        ))}
      </div>
    );
  }
  if (analysis.lines.length === 0) {
    return <p className="px-4 py-2 text-sm text-muted">Game over.</p>;
  }

  return (
    <div className="px-2 py-1.5" onMouseLeave={() => onHover?.(null)}>
      {views.map(({ line, view, short, long }) => {
        const cp = view.score.mate !== undefined ? Math.sign(view.score.mate) : (view.score.cp ?? 0);
        return (
          <button
            type="button"
            key={line.rank}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
            onMouseEnter={() => onHover?.(line.pv[0] ?? null)}
            onClick={() => line.pv[0] && onPlay?.(line.pv[0])}
            title="Play this move"
          >
            <span
              className={cn(
                'w-14 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[12px] font-bold',
                cp >= 0 ? 'bg-[#f2f2f2] text-[#2a2825]' : 'bg-[#403d39] text-[#f2f2f2]',
              )}
            >
              {formatScore(view.score)}
            </span>
            <span className="truncate font-mono text-[12.5px] text-muted" title={long}>
              {short}
            </span>
          </button>
        );
      })}
      <p className="px-1.5 pt-0.5 text-[11px] text-subtle">Stockfish 17 · depth {analysis.depth}</p>
    </div>
  );
});
