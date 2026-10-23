import { formatLine } from '@/lib/analysis/explain';
import { lineView } from '@/lib/analysis/review';
import { formatScore, type PositionAnalysis } from '@/lib/engine/uci';
import { cn } from '@/lib/utils';

/** The engine's top candidate lines for the position on the board. */
export function EngineLines({ analysis, onHover }: { analysis: PositionAnalysis | null; onHover?: (uci: string | null) => void }) {
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
      {analysis.lines.map((line) => {
        const view = lineView(analysis, line, 10);
        const cp = view.score.mate !== undefined ? Math.sign(view.score.mate) : (view.score.cp ?? 0);
        return (
          <div
            key={line.rank}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
            onMouseEnter={() => onHover?.(line.pv[0] ?? null)}
          >
            <span
              className={cn(
                'w-14 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[12px] font-bold',
                cp >= 0 ? 'bg-[#f2f2f2] text-[#2a2825]' : 'bg-[#403d39] text-[#f2f2f2]',
              )}
            >
              {formatScore(view.score)}
            </span>
            <span className="truncate font-mono text-[12.5px] text-muted" title={formatLine(analysis.fen, view.san, 20)}>
              {formatLine(analysis.fen, view.san, 10)}
            </span>
          </div>
        );
      })}
      <p className="px-1.5 pt-0.5 text-[11px] text-subtle">Stockfish 17 · depth {analysis.depth}</p>
    </div>
  );
}
