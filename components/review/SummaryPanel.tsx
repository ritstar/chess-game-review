import { ClassificationIcon } from '@/components/ClassificationIcon';
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, type GameReview } from '@/lib/analysis/types';
import type { PlyRecord } from '@/lib/games/pgn';
import type { GameRecord } from '@/lib/games/types';
import { cn } from '@/lib/utils';

interface SummaryPanelProps {
  game: GameRecord;
  review: GameReview | null;
  plies: PlyRecord[];
  onSelect: (index: number) => void;
  onStart: () => void;
}

function AccuracyCard({ name, value, color }: { name: string; value: number | null | undefined; color: 'w' | 'b' }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-3">
      <span className="max-w-full truncate text-[13px] font-semibold text-muted">{name}</span>
      <span
        className={cn(
          'min-w-[4.5rem] rounded-md px-2 py-1 text-center text-[22px] font-extrabold tabular-nums',
          color === 'w' ? 'bg-[#f2f2f2] text-[#2a2825]' : 'bg-[#3e3b37] text-[#f2f2f2] ring-1 ring-white/10',
        )}
      >
        {value == null ? <span className="inline-block w-10 opacity-50">—</span> : value.toFixed(1)}
      </span>
    </div>
  );
}

export function SummaryPanel({ game, review, plies, onSelect, onStart }: SummaryPanelProps) {
  const rows = CLASSIFICATIONS.filter((c) => c !== 'forced' || (review && review.white.counts.forced + review.black.counts.forced > 0));

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Accuracy</p>
        <div className="mt-2 flex gap-2">
          <AccuracyCard name={game.white.name} value={review?.white.accuracy} color="w" />
          <AccuracyCard name={game.black.name} value={review?.black.accuracy} color="b" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[14px]">
          <tbody>
            {rows.map((c) => (
              <tr key={c} className="border-b border-line/60 last:border-0">
                <td className="w-14 py-1.5 text-center font-bold tabular-nums" style={{ color: `var(--color-${c})` }}>
                  {review ? review.white.counts[c] : '·'}
                </td>
                <td className="py-1.5">
                  <span className="flex items-center justify-center gap-2 font-medium text-fg/90">
                    <ClassificationIcon classification={c} size={18} />
                    <span className="w-24">{CLASSIFICATION_LABEL[c]}</span>
                  </span>
                </td>
                <td className="w-14 py-1.5 text-center font-bold tabular-nums" style={{ color: `var(--color-${c})` }}>
                  {review ? review.black.counts[c] : '·'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {review && review.keyMoments.length > 0 && (
        <div>
          <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Key moments</p>
          <div className="mt-2 space-y-1">
            {review.keyMoments.map((i) => {
              const m = review.moves[i]!;
              const p = plies[i];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelect(i)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  <ClassificationIcon classification={m.classification} size={20} />
                  <span className="w-16 shrink-0 font-mono text-[13px] font-semibold">
                    {p.moveNumber}
                    {p.color === 'w' ? '.' : '…'} {p.san}
                  </span>
                  <span className="truncate text-[13px] text-muted">{m.explanation.details[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button type="button" className="btn btn-primary w-full py-3 text-[15px]" onClick={onStart}>
        Start review
      </button>
    </div>
  );
}
