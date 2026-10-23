'use client';

import { useRef, useState } from 'react';
import type { EvalPoint, MoveReview } from '@/lib/analysis/types';
import { formatScore } from '@/lib/engine/uci';
import type { PlyRecord } from '@/lib/games/pgn';

const MARKED = new Set(['brilliant', 'great', 'miss', 'mistake', 'blunder']);
const W = 600;
const H = 100;

interface EvalGraphProps {
  evals: (EvalPoint | null)[];
  moves: (MoveReview | null)[];
  plies: PlyRecord[];
  /** -1 = start position */
  current: number;
  onSelect: (index: number) => void;
  height?: number;
}

/**
 * White's winning chances over the game. Click or drag to jump to a move;
 * coloured dots mark the key moments.
 */
export function EvalGraph({ evals, moves, plies, current, onSelect, height = 96 }: EvalGraphProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = evals.length - 1;
  if (n < 1) return null;

  const x = (i: number) => (i / n) * W;
  const y = (win: number) => H - (win / 100) * H;

  // Unanalysed positions hold the last known value so the area stays continuous.
  let last = 50;
  const points = evals.map((e, i) => {
    if (e) last = e.win;
    return [x(i), y(e ? e.win : last)] as const;
  });
  const analysed = evals.findLastIndex((e) => e !== null);
  const line = points.slice(0, analysed + 1).map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = analysed >= 0 ? `0,${H} ${line} ${x(analysed).toFixed(1)},${H}` : '';

  const indexFromEvent = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * n) - 1; // position i is after ply i-1
  };

  const hovered = hover !== null ? evals[hover + 1] : null;
  const hoveredPly = hover !== null && hover >= 0 ? plies[hover] : null;

  return (
    <div className="relative select-none">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full cursor-pointer touch-none overflow-visible rounded-md"
        style={{ height }}
        role="slider"
        aria-label="Evaluation graph. Use arrow keys on the board to step through moves."
        aria-valuemin={-1}
        aria-valuemax={n - 1}
        aria-valuenow={current}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const i = indexFromEvent(e.clientX);
          if (i !== null) onSelect(i);
        }}
        onPointerMove={(e) => {
          const i = indexFromEvent(e.clientX);
          setHover(i);
          if (e.buttons === 1 && i !== null) onSelect(i);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <rect width={W} height={H} fill="#3a3835" />
        {area && <polygon points={area} fill="#f2f2f2" />}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#7a7670" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
        {current >= -1 && (
          <line
            x1={x(current + 1)}
            x2={x(current + 1)}
            y1={0}
            y2={H}
            stroke="var(--color-accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {hover !== null && hover !== current && (
          <line x1={x(hover + 1)} x2={x(hover + 1)} y1={0} y2={H} stroke="#fff" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Dots are HTML so they stay round regardless of the SVG's aspect ratio. */}
      {moves.map((m) =>
        m && MARKED.has(m.classification) ? (
          <span
            key={m.index}
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#1f1d1a]"
            style={{
              left: `${(x(m.index + 1) / W) * 100}%`,
              top: `${(y(evals[m.index + 1]?.win ?? 50) / H) * 100}%`,
              background: `var(--color-${m.classification})`,
            }}
          />
        ) : null,
      )}
      {hover !== null && hovered && (
        <div
          className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 font-mono text-[11px] text-white"
          style={{ left: `${(x(hover + 1) / W) * 100}%` }}
        >
          {hoveredPly ? `${hoveredPly.moveNumber}${hoveredPly.color === 'w' ? '.' : '...'} ${hoveredPly.san}  ` : 'Start  '}
          {formatScore(hovered.score)}
        </div>
      )}
    </div>
  );
}
