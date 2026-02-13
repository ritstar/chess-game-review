'use client';

import { Evaluation } from '@/lib/stockfish';
import { evalToCpFromTurnPerspective } from '@/lib/analysis';

interface EvaluationBarProps {
  evaluation: Evaluation | null;
  orientation?: 'white' | 'black';
}

/**
 * Get evaluation from White's perspective (absolute, not relative to turn).
 * evalData is from the side-to-move's perspective.
 * turnToMoveAfter is whose turn it is in the position being evaluated
 * (i.e., the turn AFTER the move was made).
 */
function getWhiteCp(evaluation: Evaluation | null, turnAfter: 'w' | 'b'): number {
  if (!evaluation) return 0;
  const cp = evalToCpFromTurnPerspective(evaluation);
  // evaluation is from turnAfter's perspective
  return turnAfter === 'w' ? cp : -cp;
}

export function EvaluationBar({ evaluation, orientation = 'white' }: EvaluationBarProps) {
  // Determine whose turn it is from the evaluation context
  // We just show the bar based on white perspective
  // The evaluation passed in is from the position after a move,
  // so we need to infer the turn. We'll accept a simpler approach:
  // the caller should pass the correct white-perspective value.

  const cp = evaluation
    ? (typeof evaluation.mate === 'number'
      ? Math.sign(evaluation.mate) * (10000 - Math.abs(evaluation.mate) * 10)
      : (evaluation.cp ?? 0))
    : 0;

  // We receive cp from side-to-move perspective of the AFTER position
  // For the eval bar, we always want white's perspective
  // The page component will handle this conversion
  const clamped = Math.max(-1500, Math.min(1500, cp));

  // Calculate white fill percentage (50% = even, 100% = white winning big)
  const whiteFill = 50 + (clamped / 1500) * 45; // cap visual at 5-95%
  const clampedFill = Math.max(5, Math.min(95, whiteFill));

  // Determine which side the eval label should show
  const isWhiteAdvantage = cp >= 0;

  // Format the label
  let label: string;
  if (!evaluation) {
    label = '0.0';
  } else if (typeof evaluation.mate === 'number') {
    label = `M${Math.abs(evaluation.mate)}`;
  } else {
    label = (Math.abs(cp) / 100).toFixed(1);
  }

  return (
    <div className="relative flex h-full w-[30px] flex-col overflow-hidden rounded-sm"
      style={{ background: '#403d39' }}>
      {/* Black section (top) */}
      <div
        className="eval-bar-fill relative w-full"
        style={{
          height: `${100 - clampedFill}%`,
          background: '#403d39',
        }}
      >
        {!isWhiteAdvantage && (
          <div className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold text-white">
            {label}
          </div>
        )}
      </div>

      {/* White section (bottom) */}
      <div
        className="eval-bar-fill relative w-full"
        style={{
          height: `${clampedFill}%`,
          background: '#f0f0f0',
        }}
      >
        {isWhiteAdvantage && (
          <div className="absolute top-1 left-0 right-0 text-center text-[10px] font-bold text-[#272522]">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
