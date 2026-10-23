'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
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

/** One move in the strip. Memoised: a step only re-renders the two moves whose state changed. */
const StripToken = memo(function StripToken({
  ply,
  dataKey,
  target,
  active,
  classification,
  showNumber,
  variation,
  onSelect,
}: {
  ply: PlyRecord;
  dataKey: string;
  target: number;
  active: boolean;
  classification?: Classification;
  showNumber: boolean;
  variation: boolean;
  onSelect: (target: number) => void;
}) {
  return (
    <span className="flex shrink-0 items-center">
      {showNumber && (
        <span className="pr-1 pl-2 text-[15px] text-subtle">
          {ply.moveNumber}
          {ply.color === 'w' ? '.' : '...'}
        </span>
      )}
      <button
        type="button"
        data-key={dataKey}
        onClick={() => onSelect(target)}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-[17px] font-semibold whitespace-nowrap',
          active ? 'bg-surface-3 text-fg shadow-[inset_0_-2px_0_var(--color-fg)]' : 'text-fg/80',
          variation && !active && 'text-[var(--color-great)]',
        )}
      >
        {classification && MARKED.has(classification) && <ClassificationIcon classification={classification} size={14} />}
        <span className="figurine">{figurine(ply.san)}</span>
      </button>
    </span>
  );
});

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

  return (
    <div className="flex items-center gap-1 py-1">
      <button type="button" className="icon-btn shrink-0" aria-label="Previous move" disabled={!canPrev} onClick={onPrev}>
        <ChevronLeft size={28} />
      </button>
      <div ref={ref} className="no-scrollbar relative flex min-w-0 flex-1 items-center overflow-x-auto">
        {plies.slice(0, mainUntil + 1).map((p, i) => (
          <StripToken
            key={`m${i}`}
            ply={p}
            dataKey={`m${i}`}
            target={i}
            active={!inVar && nav.current === i}
            classification={moves[i]?.classification}
            showNumber={p.color === 'w' || i === 0}
            variation={false}
            onSelect={onSelectMain}
          />
        ))}
        {inVar && (
          <>
            <span className="shrink-0 pl-2 text-subtle">(</span>
            {nav.variation!.moves.map((p, i) => (
              <StripToken
                key={`v${i}`}
                ply={p}
                dataKey={`v${i + 1}`}
                target={i + 1}
                active={nav.cursor === i + 1}
                classification={reviewOf(p)?.classification}
                showNumber={p.color === 'w' || i === 0}
                variation
                onSelect={onSelectVariation}
              />
            ))}
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
