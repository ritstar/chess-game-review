import type { EvalPoint } from '@/lib/analysis/types';
import { formatScore } from '@/lib/engine/uci';

/** Vertical evaluation bar; White's share grows from the bottom when White is at the bottom. */
export function EvalBar({ evaluation, orientation }: { evaluation: EvalPoint | null; orientation: 'white' | 'black' }) {
  const win = evaluation?.win ?? 50;
  // Keep a sliver of each colour visible unless the game is decided.
  const whiteShare = evaluation?.terminal === 'checkmate' ? win : Math.min(96, Math.max(4, win));
  const whiteAhead = (evaluation?.cp ?? 0) >= 0;
  const label = evaluation
    ? evaluation.terminal === 'checkmate'
      ? whiteAhead
        ? '1-0'
        : '0-1'
      : evaluation.terminal
        ? '½-½'
        : typeof evaluation.score.mate === 'number'
          ? `M${Math.abs(evaluation.score.mate)}`
          : (Math.abs(evaluation.score.cp ?? 0) / 100).toFixed(1)
    : '';
  const whiteAtBottom = orientation === 'white';

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[3px] bg-[#403d39]"
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(win)}
      aria-valuetext={evaluation ? formatScore(evaluation.score) : 'No evaluation'}
    >
      <div
        className="absolute inset-x-0 bg-[#f2f2f2] transition-[height] duration-500 ease-out"
        style={{ height: `${whiteShare}%`, [whiteAtBottom ? 'bottom' : 'top']: 0 }}
      />
      {label && (
        <span
          className="absolute inset-x-0 text-center font-mono text-[10px] font-bold leading-none"
          style={{
            color: whiteAhead ? '#403d39' : '#f2f2f2',
            [whiteAhead === whiteAtBottom ? 'bottom' : 'top']: 6,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
