'use client';

import { Chess, type Square } from 'chess.js';
import { useMemo, useState } from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import type { Classification } from '@/lib/analysis/types';
import { BOARD_THEMES, type BoardTheme } from '@/lib/settings';
import { cn } from '@/lib/utils';

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
}

export interface BoardMove {
  from: string;
  to: string;
  promotion?: string;
}

interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  theme: BoardTheme;
  lastMove?: { from: string; to: string } | null;
  classification?: Classification | null;
  arrows?: BoardArrow[];
  checkSquare?: string | null;
  /** Squares under attack to call out (e.g. the queen a move threatens). */
  threatSquares?: string[];
  /** Let the user move pieces for the side to move. */
  interactive?: boolean;
  /** Called with a legal move. */
  onMove?: (move: BoardMove) => void;
  onIllegal?: () => void;
  className?: string;
}

const HIGHLIGHT_ALPHA = 0.5;

function tint(classification: Classification | null | undefined) {
  if (!classification) return `rgba(255, 255, 51, ${HIGHLIGHT_ALPHA * 0.8})`;
  return `color-mix(in srgb, var(--color-${classification}) ${HIGHLIGHT_ALPHA * 100}%, transparent)`;
}

const PROMOTION_PIECES = ['q', 'n', 'r', 'b'] as const;

export function Board({
  fen,
  orientation,
  theme,
  lastMove,
  classification,
  arrows = [],
  checkSquare,
  threatSquares = [],
  interactive = false,
  onMove,
  onIllegal,
  className,
}: BoardProps) {
  const colors = BOARD_THEMES[theme];
  // Selection and pending promotion belong to one position; a new FEN resets them.
  const [selection, setSelection] = useState<{ fen: string; square: string } | null>(null);
  const [promotion, setPromotion] = useState<{ fen: string; from: string; to: string } | null>(null);
  const selected = selection?.fen === fen ? selection.square : null;
  const pendingPromotion = promotion?.fen === fen ? promotion : null;

  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = chess.turn();
  const targets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to));
  }, [chess, selected]);

  const tryMove = (from: string, to: string): boolean => {
    setSelection(null);
    const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (legal.length === 0) {
      if (from !== to) onIllegal?.();
      return false;
    }
    if (legal.some((m) => m.promotion)) {
      setPromotion({ fen, from, to });
      return false;
    }
    onMove?.({ from, to });
    return true;
  };

  const options = useMemo(
    () => ({
      id: 'review-board',
      position: fen,
      boardOrientation: orientation,
      allowDragging: interactive,
      dragActivationDistance: 6,
      canDragPiece: ({ piece }: { piece: { pieceType: string } }) => interactive && piece.pieceType[0] === turn,
      allowDrawingArrows: true,
      animationDurationInMs: 180,
      darkSquareStyle: { backgroundColor: colors.dark, backgroundImage: colors.texture },
      lightSquareStyle: { backgroundColor: colors.light, backgroundImage: colors.texture },
      darkSquareNotationStyle: { color: colors.light, fontWeight: 700 },
      lightSquareNotationStyle: { color: colors.dark, fontWeight: 700 },
      arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color })),
      clearArrowsOnPositionChange: true,
      onPieceDrag: ({ square }: { square: string | null }) => {
        if (interactive && square) setSelection({ fen, square });
      },
      onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) =>
        interactive && !!targetSquare && tryMove(sourceSquare, targetSquare),
      onSquareClick: ({ piece, square }: { piece: { pieceType: string } | null; square: string }) => {
        if (!interactive || pendingPromotion) return;
        if (selected && targets.has(square)) {
          tryMove(selected, square);
          return;
        }
        if (piece && piece.pieceType[0] === turn && square !== selected) setSelection({ fen, square });
        else setSelection(null);
      },
      squareRenderer: ({ square, piece, children }: { square: string; piece: unknown; children?: React.ReactNode }) => {
        const isFrom = lastMove?.from === square;
        const isTo = lastMove?.to === square;
        const inCheck = checkSquare === square;
        const isTarget = targets.has(square);
        return (
          <div className="relative h-full w-full">
            {(isFrom || isTo) && (
              <div className="absolute inset-0" style={{ background: tint(isTo ? classification : null) }} />
            )}
            {selected === square && <div className="absolute inset-0 bg-[rgba(255,255,51,0.5)]" />}
            {threatSquares.includes(square) && <div className="absolute inset-0 bg-[rgba(245,140,30,0.6)]" />}
            {inCheck && (
              <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(circle, rgba(255,0,0,.85) 0%, rgba(231,0,0,.5) 35%, transparent 70%)' }}
              />
            )}
            {children}
            {isTarget && (
              <div
                className="pointer-events-none absolute inset-0 z-[5]"
                style={{
                  background: piece
                    ? 'radial-gradient(circle, transparent 0 62%, rgba(0,0,0,.18) 63% 78%, transparent 79%)'
                    : 'radial-gradient(circle, rgba(0,0,0,.2) 0 16%, transparent 17%)',
                }}
              />
            )}
            {isTo && classification && (
              <div className="badge-pop pointer-events-none absolute top-[3%] right-[3%] z-10 w-[38%]" key={fen}>
                <ClassificationIcon classification={classification} size={26} className="aspect-square h-auto! w-full!" />
              </div>
            )}
          </div>
        );
      },
    }),
    // tryMove only closes over values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen, orientation, colors, arrows, lastMove, classification, checkSquare, threatSquares, interactive, selected, targets, turn, pendingPromotion],
  );

  return (
    <div className={cn('board-shell relative overflow-visible shadow-[0_8px_30px_rgba(0,0,0,.35)]', className)}>
      <Chessboard options={options} />
      {pendingPromotion && (
        <PromotionPicker
          to={pendingPromotion.to}
          color={turn}
          orientation={orientation}
          onPick={(p) => {
            setPromotion(null);
            onMove?.({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: p });
          }}
          onCancel={() => setPromotion(null)}
        />
      )}
    </div>
  );
}

function PromotionPicker({
  to,
  color,
  orientation,
  onPick,
  onCancel,
}: {
  to: string;
  color: 'w' | 'b';
  orientation: 'white' | 'black';
  onPick: (piece: string) => void;
  onCancel: () => void;
}) {
  const file = to.charCodeAt(0) - 97;
  const rank = Number(to[1]);
  const col = orientation === 'white' ? file : 7 - file;
  const atTop = (orientation === 'white' ? 8 - rank : rank - 1) === 0;

  return (
    <div className="absolute inset-0 z-30 bg-black/40" onClick={onCancel} role="dialog" aria-label="Choose promotion piece">
      <div
        className={cn('absolute flex w-[12.5%] flex-col overflow-hidden rounded-md bg-[#f2f2f2] shadow-2xl', !atTop && 'flex-col-reverse')}
        style={{ left: `${col * 12.5}%`, [atTop ? 'top' : 'bottom']: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {PROMOTION_PIECES.map((p) => {
          const Piece = defaultPieces[`${color}${p.toUpperCase()}`];
          return (
            <button
              key={p}
              type="button"
              aria-label={{ q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[p]}
              className="aspect-square w-full p-[6%] hover:bg-[#d8d8d8]"
              onClick={() => onPick(p)}
            >
              {Piece?.()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
