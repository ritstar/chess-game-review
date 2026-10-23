'use client';

import { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import type { Classification } from '@/lib/analysis/types';
import { BOARD_THEMES, type BoardTheme } from '@/lib/settings';

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
}

interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  theme: BoardTheme;
  lastMove?: { from: string; to: string } | null;
  classification?: Classification | null;
  arrows?: BoardArrow[];
  checkSquare?: string | null;
}

const HIGHLIGHT_ALPHA = 0.5;

function tint(classification: Classification | null | undefined) {
  if (!classification) return `rgba(255, 255, 51, ${HIGHLIGHT_ALPHA * 0.8})`;
  return `color-mix(in srgb, var(--color-${classification}) ${HIGHLIGHT_ALPHA * 100}%, transparent)`;
}

export function Board({ fen, orientation, theme, lastMove, classification, arrows = [], checkSquare }: BoardProps) {
  const colors = BOARD_THEMES[theme];

  const options = useMemo(
    () => ({
      id: 'review-board',
      position: fen,
      boardOrientation: orientation,
      allowDragging: false,
      allowDrawingArrows: true,
      animationDurationInMs: 180,
      darkSquareStyle: { backgroundColor: colors.dark },
      lightSquareStyle: { backgroundColor: colors.light },
      darkSquareNotationStyle: { color: colors.light, fontWeight: 700 },
      lightSquareNotationStyle: { color: colors.dark, fontWeight: 700 },
      arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color })),
      clearArrowsOnPositionChange: true,
      squareRenderer: ({ square, children }: { square: string; children?: React.ReactNode }) => {
        const isFrom = lastMove?.from === square;
        const isTo = lastMove?.to === square;
        const inCheck = checkSquare === square;
        return (
          <div className="relative h-full w-full">
            {(isFrom || isTo) && (
              <div className="absolute inset-0" style={{ background: tint(isTo ? classification : null) }} />
            )}
            {inCheck && (
              <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(circle, rgba(255,0,0,.85) 0%, rgba(231,0,0,.5) 35%, transparent 70%)' }}
              />
            )}
            {children}
            {isTo && classification && (
              <div className="badge-pop pointer-events-none absolute top-[3%] right-[3%] z-10 w-[38%]" key={fen}>
                <ClassificationIcon classification={classification} size={26} className="aspect-square h-auto! w-full!" />
              </div>
            )}
          </div>
        );
      },
    }),
    [fen, orientation, colors, arrows, lastMove, classification, checkSquare],
  );

  return (
    <div className="board-shell overflow-visible rounded-md shadow-[0_8px_30px_rgba(0,0,0,.35)]">
      <Chessboard options={options} />
    </div>
  );
}
