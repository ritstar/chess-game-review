import { ClassificationIcon } from '@/components/ClassificationIcon';
import type { EvalPoint, MoveReview } from '@/lib/analysis/types';
import { formatScore } from '@/lib/engine/uci';
import type { PlyRecord } from '@/lib/games/pgn';

interface CoachCardProps {
  ply: PlyRecord | null;
  review: MoveReview | null;
  evaluation: EvalPoint | null;
  opening?: string;
  analyzing: boolean;
}

/** Plain-language explanation of the selected move. */
export function CoachCard({ ply, review, evaluation, opening, analyzing }: CoachCardProps) {
  if (!ply) {
    return (
      <div className="flex min-h-[112px] flex-col justify-center gap-1 px-4 py-3">
        <p className="text-[15px] font-semibold">Starting position</p>
        <p className="text-sm text-muted">
          {opening ? `${opening}. ` : ''}Use ← → or click a move to step through the game.
        </p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex min-h-[112px] flex-col justify-center gap-2 px-4 py-3">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-11/12" />
        <div className="skeleton h-3 w-1/2" />
        <span className="sr-only">{analyzing ? 'Analyzing this move…' : 'Not analyzed'}</span>
      </div>
    );
  }

  const c = review.classification;
  return (
    <div className="flex min-h-[112px] gap-3 px-4 py-3" aria-live="polite">
      <ClassificationIcon classification={c} size={30} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[16px] font-bold leading-snug" style={{ color: `var(--color-${c})` }}>
            {review.explanation.headline}
          </p>
          {evaluation && (
            <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-fg">
              {evaluation.terminal === 'checkmate' ? '#' : formatScore(evaluation.score)}
            </span>
          )}
        </div>
        <ul className="mt-1 space-y-0.5 text-[13.5px] leading-relaxed text-muted">
          {review.explanation.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
