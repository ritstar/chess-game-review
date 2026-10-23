import type { EvalPoint } from '@/lib/analysis/types';
import { formatScore } from '@/lib/engine/uci';

/** Mobile evaluation bar: White's share fills from the left, score on the leading side. */
export function HorizontalEvalBar({ evaluation }: { evaluation: EvalPoint | null }) {
  const win = evaluation?.win ?? 50;
  const share = evaluation?.terminal === 'checkmate' ? win : Math.min(97, Math.max(3, win));
  const whiteAhead = (evaluation?.cp ?? 0) >= 0;
  const label = evaluation
    ? evaluation.terminal === 'checkmate'
      ? whiteAhead
        ? '1-0'
        : '0-1'
      : evaluation.terminal
        ? '½-½'
        : formatScore(evaluation.score)
    : '';

  return (
    <div
      className="relative h-7 overflow-hidden rounded-md bg-[#403d39]"
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(win)}
      aria-valuetext={label || 'No evaluation'}
    >
      <div className="absolute inset-y-0 left-0 bg-[#f2f2f2] transition-[width] duration-500 ease-out" style={{ width: `${share}%` }} />
      {label && (
        <span
          className="absolute inset-y-0 flex items-center px-2.5 font-mono text-[14px] font-bold"
          style={whiteAhead ? { left: 0, color: '#2b2926' } : { right: 0, color: '#f2f2f2' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
