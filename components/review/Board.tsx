'use client';

import { Chess, type Square } from 'chess.js';
import { memo, useMemo, useRef, useState } from 'react';
import { defaultPieces } from 'react-chessboard';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import { CLASSIFICATION_LABEL, type Classification } from '@/lib/analysis/types';
import type { Motion } from '@/lib/review/navigation';
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

type Orientation = 'white' | 'black';

interface BoardProps {
  fen: string;
  orientation: Orientation;
  theme: BoardTheme;
  lastMove?: { from: string; to: string } | null;
  classification?: Classification | null;
  arrows?: BoardArrow[];
  checkSquare?: string | null;
  /** Squares under attack to call out (e.g. the queen a move threatens). */
  threatSquares?: string[];
  /** Let the user move pieces for the side to move. */
  interactive?: boolean;
  /** Called with a legal move; `dragged` when the piece was dropped in place by hand. */
  onMove?: (move: BoardMove, dragged: boolean) => void;
  onIllegal?: () => void;
  /** Pieces to slide into place for the last step. */
  motion?: Motion | null;
  className?: string;
}

const FILES = 'abcdefgh';
/** Ratings that get the big "pop" on the board, as in Chess.com's review. */
const CELEBRATE = new Set<Classification>(['brilliant', 'great', 'best', 'excellent']);
const DRAG_THRESHOLD_PX = 4;
const USER_ARROW = 'rgba(255, 170, 0, 0.8)';

/* ── Geometry ────────────────────────────────────────────────────────── */

/** Column and row on screen (0–7 from the top-left) for a square. */
function cell(square: string, orientation: Orientation) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return orientation === 'white' ? { col: file, row: 8 - rank } : { col: 7 - file, row: rank - 1 };
}

function squareAt(col: number, row: number, orientation: Orientation): string {
  return orientation === 'white' ? `${FILES[col]}${8 - row}` : `${FILES[7 - col]}${row + 1}`;
}

function place(square: string, orientation: Orientation): React.CSSProperties {
  const { col, row } = cell(square, orientation);
  return { left: `${col * 12.5}%`, top: `${row * 12.5}%`, width: '12.5%', height: '12.5%' };
}

/** Pieces straight from the FEN's board field: no chess.js needed. */
function piecesFromFen(fen: string): { square: string; code: string }[] {
  const out: { square: string; code: string }[] = [];
  fen
    .split(' ')[0]
    .split('/')
    .forEach((rankText, i) => {
      let file = 0;
      for (const ch of rankText) {
        if (/\d/.test(ch)) file += Number(ch);
        else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          out.push({ square: `${FILES[file]}${8 - i}`, code: `${color}${ch.toUpperCase()}` });
          file++;
        }
      }
    });
  return out;
}

/* ── Static layers ───────────────────────────────────────────────────── */

/** The 64 coloured squares and coordinates. Only re-renders on theme or flip. */
const Squares = memo(function Squares({ theme, orientation }: { theme: BoardTheme; orientation: Orientation }) {
  const colors = BOARD_THEMES[theme];
  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = squareAt(col, row, orientation);
      const light = (col + row) % 2 === 0;
      squares.push(
        <div
          key={square}
          data-square={square}
          className="relative"
          style={{ backgroundColor: light ? colors.light : colors.dark, backgroundImage: colors.texture }}
        >
          {col === 0 && (
            <span className="absolute top-[3%] left-[5%] text-[clamp(8px,2.4vw,13px)] leading-none font-bold" style={{ color: light ? colors.dark : colors.light }}>
              {square[1]}
            </span>
          )}
          {row === 7 && (
            <span className="absolute right-[5%] bottom-[2%] text-[clamp(8px,2.4vw,13px)] leading-none font-bold" style={{ color: light ? colors.dark : colors.light }}>
              {square[0]}
            </span>
          )}
        </div>,
      );
    }
  }
  return <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">{squares}</div>;
});

/** One piece. Memoised so a move only re-renders the pieces it touched. */
const Piece = memo(function Piece({
  code,
  square,
  orientation,
  slideFrom,
  draggable,
}: {
  code: string;
  square: string;
  orientation: Orientation;
  slideFrom?: string;
  draggable: boolean;
}) {
  const Svg = defaultPieces[code];
  const flip = orientation === 'white' ? 1 : -1;
  const slide = slideFrom
    ? ({
        '--dx': (slideFrom.charCodeAt(0) - square.charCodeAt(0)) * flip,
        '--dy': (Number(square[1]) - Number(slideFrom[1])) * flip,
      } as React.CSSProperties)
    : undefined;
  return (
    <div
      data-piece={code}
      data-at={square}
      className={cn('pointer-events-none absolute', slideFrom && 'piece-slide', draggable && 'touch-none')}
      style={{ ...place(square, orientation), ...slide }}
    >
      {Svg?.()}
    </div>
  );
});

function arrowPath(from: string, to: string, orientation: Orientation) {
  const a = cell(from, orientation);
  const b = cell(to, orientation);
  const [x1, y1, x2, y2] = [a.col + 0.5, a.row + 0.5, b.col + 0.5, b.row + 0.5];
  const dx = Math.abs(b.col - a.col);
  const dy = Math.abs(b.row - a.row);
  // Knight moves bend like an L, as on Chess.com and Lichess.
  const points = (dx === 1 && dy === 2) || (dx === 2 && dy === 1)
    ? dy > dx
      ? [[x1, y1], [x1, y2], [x2, y2]]
      : [[x1, y1], [x2, y1], [x2, y2]]
    : [[x1, y1], [x2, y2]];
  // Stop the shaft short so the head lands on the target square.
  const [px, py] = points[points.length - 2];
  const len = Math.hypot(x2 - px, y2 - py) || 1;
  const ux = (x2 - px) / len;
  const uy = (y2 - py) / len;
  const head = 0.42;
  const tipX = x2 - ux * 0.12;
  const tipY = y2 - uy * 0.12;
  const baseX = tipX - ux * head;
  const baseY = tipY - uy * head;
  const shaft = [...points.slice(0, -1), [baseX, baseY]].map(([x, y]) => `${x},${y}`).join(' ');
  const w = 0.22;
  const headPts = [
    [tipX, tipY],
    [baseX - uy * w, baseY + ux * w],
    [baseX + uy * w, baseY - ux * w],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return { shaft, headPts };
}

const Arrows = memo(function Arrows({ arrows, orientation }: { arrows: BoardArrow[]; orientation: Orientation }) {
  if (arrows.length === 0) return null;
  return (
    <svg viewBox="0 0 8 8" className="pointer-events-none absolute inset-0 z-30 size-full" aria-hidden>
      {arrows.map((a, i) => {
        const { shaft, headPts } = arrowPath(a.from, a.to, orientation);
        return (
          <g key={`${a.from}${a.to}${i}`} fill={a.color} stroke={a.color}>
            <polyline points={shaft} fill="none" strokeWidth={0.17} strokeLinejoin="round" />
            <polygon points={headPts} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
});

/* ── Board ───────────────────────────────────────────────────────────── */

/**
 * A lightweight chessboard. Squares are a static grid; pieces are absolutely
 * positioned on top and memoised, so stepping through a game re-renders only
 * the pieces that moved, and a move starts sliding on the very next frame.
 * Supports drag-and-drop, tap-to-move, promotion and right-click arrows.
 */
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
  motion,
  className,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  // Selection, promotion and drawn arrows belong to one position; a new FEN resets them.
  const [selection, setSelection] = useState<{ fen: string; square: string } | null>(null);
  const [promotion, setPromotion] = useState<{ fen: string; from: string; to: string } | null>(null);
  const [drawn, setDrawn] = useState<{ fen: string; arrows: BoardArrow[]; circles: string[] }>({ fen, arrows: [], circles: [] });
  const press = useRef<{ square: string; x: number; y: number; dragging: boolean; wasSelected: boolean; el: HTMLElement | null } | null>(null);
  const rightPress = useRef<string | null>(null);

  const selected = selection?.fen === fen ? selection.square : null;
  const pendingPromotion = promotion?.fen === fen ? promotion : null;
  const userArrows = drawn.fen === fen ? drawn.arrows : [];
  const userCircles = drawn.fen === fen ? drawn.circles : [];

  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = chess.turn();
  const pieces = useMemo(() => piecesFromFen(fen), [fen]);
  const targets = useMemo(() => {
    if (!selected) return new Map<string, boolean>();
    return new Map(chess.moves({ square: selected as Square, verbose: true }).map((m) => [m.to, !!m.captured]));
  }, [chess, selected]);

  const tryMove = (from: string, to: string, dragged: boolean): boolean => {
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
    onMove?.({ from, to }, dragged);
    return true;
  };

  const squareFromPoint = (clientX: number, clientY: number) => {
    const rect = boardRef.current!.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return squareAt(col, row, orientation);
  };

  const ownPieceAt = (square: string) => pieces.some((p) => p.square === square && p.code[0] === turn);

  const onPointerDown = (e: React.PointerEvent) => {
    const square = squareFromPoint(e.clientX, e.clientY);
    if (!square) return;
    if (e.button === 2) {
      rightPress.current = square;
      return;
    }
    if (e.button !== 0) return;
    if (userArrows.length || userCircles.length) setDrawn({ fen, arrows: [], circles: [] });
    if (!interactive || pendingPromotion) return;

    // Tap a highlighted square to move there straight away.
    if (selected && targets.has(square) && !ownPieceAt(square)) {
      tryMove(selected, square, false);
      return;
    }
    if (ownPieceAt(square)) {
      const el = boardRef.current!.querySelector<HTMLElement>(`[data-at="${square}"]`);
      press.current = { square, x: e.clientX, y: e.clientY, dragging: false, wasSelected: selected === square, el };
      setSelection({ fen, square });
      boardRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    setSelection(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    p.dragging = true;
    // Move the piece directly on the DOM: no React render per pointer move.
    if (p.el) {
      p.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
      p.el.style.zIndex = '40';
      p.el.style.transition = 'none';
    }
  };

  const endDrag = (p: NonNullable<typeof press.current>) => {
    if (p.el) {
      p.el.style.transform = '';
      p.el.style.zIndex = '';
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.button === 2) {
      const from = rightPress.current;
      rightPress.current = null;
      const to = squareFromPoint(e.clientX, e.clientY);
      if (!from || !to) return;
      setDrawn(() => {
        const base = drawn.fen === fen ? drawn : { fen, arrows: [], circles: [] };
        if (from === to) {
          const circles = base.circles.includes(to) ? base.circles.filter((c) => c !== to) : [...base.circles, to];
          return { ...base, circles };
        }
        const exists = base.arrows.some((a) => a.from === from && a.to === to);
        const next = exists ? base.arrows.filter((a) => !(a.from === from && a.to === to)) : [...base.arrows, { from, to, color: USER_ARROW }];
        return { ...base, arrows: next };
      });
      return;
    }
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (!p.dragging) {
      // A plain tap on the already-selected piece deselects it.
      if (p.wasSelected) setSelection(null);
      return;
    }
    const target = squareFromPoint(e.clientX, e.clientY);
    const moved = !!target && target !== p.square && tryMove(p.square, target, true);
    endDrag(p);
    if (!moved && target === p.square) setSelection({ fen, square: p.square });
  };

  const onPointerCancel = () => {
    if (press.current) endDrag(press.current);
    press.current = null;
  };

  const slides = new Map(motion?.slides.map((s) => [s.to, s.from]));
  const highlight = (square: string, background: string, key: string) => (
    <div key={key} className="pointer-events-none absolute" style={{ ...place(square, orientation), background }} />
  );
  const tint = classification
    ? `color-mix(in srgb, var(--color-${classification}) 50%, transparent)`
    : 'rgba(255, 255, 51, 0.4)';

  return (
    <div
      ref={boardRef}
      className={cn(
        'board-shell relative overflow-visible shadow-[0_8px_30px_rgba(0,0,0,.35)] select-none [-webkit-touch-callout:none]',
        // Drags must not scroll the page.
        interactive && 'touch-none',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      role="img"
      aria-label={`Chess board, ${turn === 'w' ? 'White' : 'Black'} to move`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <Squares theme={theme} orientation={orientation} />
      </div>

      {/* Square highlights */}
      {lastMove && highlight(lastMove.from, 'rgba(255, 255, 51, 0.4)', 'from')}
      {lastMove && highlight(lastMove.to, tint, 'to')}
      {selected && highlight(selected, 'rgba(255, 255, 51, 0.5)', 'sel')}
      {threatSquares.map((s) => highlight(s, 'rgba(245, 140, 30, 0.6)', `t${s}`))}
      {userCircles.map((s) =>
        highlight(s, 'radial-gradient(circle, transparent 0 58%, rgba(255,170,0,.85) 59% 68%, transparent 69%)', `c${s}`),
      )}
      {checkSquare &&
        highlight(checkSquare, 'radial-gradient(circle, rgba(255,0,0,.85) 0%, rgba(231,0,0,.5) 35%, transparent 70%)', 'check')}

      {/* Pieces */}
      {pieces.map((p) => (
        <Piece
          // Including the motion key remounts a moving piece, restarting its slide.
          key={`${p.square}${p.code}${slides.has(p.square) ? motion!.key : ''}`}
          code={p.code}
          square={p.square}
          orientation={orientation}
          slideFrom={slides.get(p.square)}
          draggable={interactive && p.code[0] === turn}
        />
      ))}

      {/* Legal move markers */}
      {[...targets].map(([square, capture]) =>
        highlight(
          square,
          capture
            ? 'radial-gradient(circle, transparent 0 62%, rgba(0,0,0,.18) 63% 78%, transparent 79%)'
            : 'radial-gradient(circle, rgba(0,0,0,.2) 0 16%, transparent 17%)',
          `m${square}`,
        ),
      )}

      {lastMove && classification && (
        // Keyed by position and rating so the animation plays once per move
        // (or when a tried move's rating arrives).
        <div key={`${fen}:${classification}`} className="pointer-events-none absolute z-20" style={place(lastMove.to, orientation)}>
          {CELEBRATE.has(classification) && (
            <>
              {/* Chess.com-style pop: the square flashes, a big icon bursts over the piece with a label, then settles into the corner badge. */}
              <div className="celebrate-square absolute inset-0" style={{ background: `var(--color-${classification})` }} />
              <div className="celebrate-icon absolute inset-0 flex items-center justify-center">
                <div className="aspect-square w-[68%]">
                  <ClassificationIcon classification={classification} size={48} className="h-full! w-full! shadow-lg" />
                </div>
              </div>
              <span
                className="celebrate-label absolute -top-[30%] left-1/2 rounded-full bg-white px-2.5 py-0.5 text-[clamp(11px,3.4vw,15px)] font-extrabold whitespace-nowrap shadow-md"
                style={{ color: `var(--color-${classification})` }}
              >
                {CLASSIFICATION_LABEL[classification]}
              </span>
            </>
          )}
          <div className={cn('absolute top-[3%] right-[3%] w-[38%]', CELEBRATE.has(classification) ? 'badge-after-celebrate' : 'badge-pop')}>
            <ClassificationIcon classification={classification} size={26} className="aspect-square h-auto! w-full!" />
          </div>
        </div>
      )}

      <Arrows arrows={userArrows.length ? [...arrows, ...userArrows] : arrows} orientation={orientation} />

      {pendingPromotion && (
        <PromotionPicker
          to={pendingPromotion.to}
          color={turn}
          orientation={orientation}
          onPick={(p) => {
            setPromotion(null);
            onMove?.({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: p }, false);
          }}
          onCancel={() => setPromotion(null)}
        />
      )}
    </div>
  );
}

const PROMOTION_PIECES = ['q', 'n', 'r', 'b'] as const;

function PromotionPicker({
  to,
  color,
  orientation,
  onPick,
  onCancel,
}: {
  to: string;
  color: 'w' | 'b';
  orientation: Orientation;
  onPick: (piece: string) => void;
  onCancel: () => void;
}) {
  const { col, row } = cell(to, orientation);
  const atTop = row === 0;

  return (
    <div
      className="absolute inset-0 z-50 bg-black/40"
      onPointerDown={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      role="dialog"
      aria-label="Choose promotion piece"
    >
      <div
        className={cn('absolute flex w-[12.5%] flex-col overflow-hidden rounded-md bg-[#f2f2f2] shadow-2xl', !atTop && 'flex-col-reverse')}
        style={{ left: `${col * 12.5}%`, [atTop ? 'top' : 'bottom']: 0 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {PROMOTION_PIECES.map((p) => {
          const Svg = defaultPieces[`${color}${p.toUpperCase()}`];
          return (
            <button
              key={p}
              type="button"
              aria-label={{ q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[p]}
              className="aspect-square w-full p-[6%] hover:bg-[#d8d8d8]"
              onClick={() => onPick(p)}
            >
              {Svg?.()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
