'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import type { Classification, MoveReview } from '@/lib/analysis/types';
import { figurine } from '@/lib/format';
import type { PlyRecord } from '@/lib/games/pgn';
import type { NavState } from '@/lib/review/navigation';
import { cn } from '@/lib/utils';

const MARKED = new Set<Classification>(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);

interface MoveStripProps {
  plies: PlyRecord[];
  moves: (MoveReview | null)[];
  nav: NavState;
  reviewOf: (p: PlyRecord) => MoveReview | null;
  onSelectMain: (index: number) => void;
  onSelectVariation: (cursor: number) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

/** Horizontal, scrollable move list for small screens (one row, like the mobile apps). */
export function MoveStrip({ plies, moves, nav, reviewOf, onSelectMain, onSelectVariation, onPrev, onNext, canPrev, canNext }: MoveStripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inVar = nav.cursor > 0 && nav.variation;
  const mainUntil = inVar ? nav.variation!.base : plies.length - 1;
  const activeKey = inVar ? `v${nav.cursor}` : `m${nav.current}`;

  useEffect(() => {
    const container = ref.current;
    const el = container?.querySelector<HTMLElement>(`[data-key="${activeKey}"]`);
    if (!container) return;
    if (!el) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    container.scrollTo({ left: el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
  }, [activeKey]);

  const token = (p: PlyRecord, key: string, active: boolean, c: Classification | undefined, onClick: () => void, variation = false) => (
    <span key={key} className="flex shrink-0 items-center">
      {(p.color === 'w' || key === 'v1' || key === 'm0') && (
        <span className="pr-1 pl-2 text-[15px] text-subtle">
          {p.moveNumber}
          {p.color === 'w' ? '.' : '...'}
        </span>
      )}
      <button
        type="button"
        data-key={key}
        onClick={onClick}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-[17px] font-semibold whitespace-nowrap',
          active ? 'bg-surface-3 text-fg shadow-[inset_0_-2px_0_var(--color-fg)]' : 'text-fg/80',
          variation && !active && 'text-[var(--color-great)]',
        )}
      >
        {c && MARKED.has(c) && <ClassificationIcon classification={c} size={14} />}
        <span className="figurine">{figurine(p.san)}</span>
      </button>
    </span>
  );

  return (
    <div className="flex items-center gap-1 py-1">
      <button type="button" className="icon-btn shrink-0" aria-label="Previous move" disabled={!canPrev} onClick={onPrev}>
        <ChevronLeft size={28} />
      </button>
      <div ref={ref} className="no-scrollbar relative flex min-w-0 flex-1 items-center overflow-x-auto">
        {plies.slice(0, mainUntil + 1).map((p, i) =>
          token(p, `m${i}`, !inVar && nav.current === i, moves[i]?.classification, () => onSelectMain(i)),
        )}
        {inVar && (
          <>
            <span className="shrink-0 pl-2 text-subtle">(</span>
            {nav.variation!.moves.map((p, i) =>
              token(p, `v${i + 1}`, nav.cursor === i + 1, reviewOf(p)?.classification, () => onSelectVariation(i + 1), true),
            )}
            <span className="shrink-0 pr-2 text-subtle">)</span>
          </>
        )}
        <span className="w-8 shrink-0" />
      </div>
      <button type="button" className="icon-btn shrink-0" aria-label="Next move" disabled={!canNext} onClick={onNext}>
        <ChevronRight size={28} />
      </button>
    </div>
  );
}
