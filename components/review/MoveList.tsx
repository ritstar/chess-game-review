'use client';

import { X } from 'lucide-react';
import { Fragment, memo, useEffect, useRef } from 'react';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import type { Classification, MoveReview } from '@/lib/analysis/types';
import { figurine } from '@/lib/format';
import type { PlyRecord } from '@/lib/games/pgn';
import type { NavState } from '@/lib/review/navigation';
import { cn } from '@/lib/utils';

/** Classifications worth an icon in the list; the rest would just be noise. */
const SHOWN = new Set<Classification>(['brilliant', 'great', 'best', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']);

interface MoveListProps {
  plies: PlyRecord[];
  moves: (MoveReview | null)[];
  nav: NavState;
  reviewOf: (p: PlyRecord) => MoveReview | null;
  onSelect: (index: number) => void;
  onSelectVariation: (cursor: number) => void;
  onDiscardVariation: () => void;
}

/** One game move. Memoised: a step only re-renders the two cells whose state changed. */
const MoveCell = memo(function MoveCell({
  ply,
  classification: c,
  active,
  onSelect,
}: {
  ply: PlyRecord;
  classification?: Classification;
  active: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={() => onSelect(ply.index)}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md px-2 text-left text-[14px] font-semibold transition-colors',
        active ? 'bg-surface-3 text-fg' : 'text-fg/85 hover:bg-surface-2',
      )}
      style={active && c ? { boxShadow: `inset 0 -2px 0 var(--color-${c})` } : undefined}
    >
      <span className="flex size-4 items-center justify-center">
        {c && SHOWN.has(c) && <ClassificationIcon classification={c} size={16} />}
      </span>
      <span className="figurine">{figurine(ply.san)}</span>
    </button>
  );
});

export function MoveList({ plies, moves, nav, reviewOf, onSelect, onSelectVariation, onDiscardVariation }: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inVar = nav.cursor > 0 && !!nav.variation;
  const activeKey = inVar ? `v${nav.cursor}` : `m${nav.current}`;

  // Keep the active move visible without scrolling the page.
  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    const top = active.offsetTop - container.offsetTop;
    if (top < container.scrollTop + 8 || top + active.offsetHeight > container.scrollTop + container.clientHeight - 8) {
      container.scrollTo({ top: top - container.clientHeight / 2, behavior: 'smooth' });
    }
  }, [activeKey]);

  const rows: { number: number; white?: PlyRecord; black?: PlyRecord }[] = [];
  for (const p of plies) {
    if (p.color === 'w' || rows.length === 0) rows.push({ number: p.moveNumber });
    rows[rows.length - 1][p.color === 'w' ? 'white' : 'black'] = p;
  }

  const cell = (p?: PlyRecord) =>
    p ? (
      <MoveCell ply={p} classification={moves[p.index]?.classification} active={!inVar && p.index === nav.current} onSelect={onSelect} />
    ) : (
      <div />
    );

  const variation = nav.variation;
  const variationBlock = variation && (
    <div className="my-1 ml-9 flex items-start gap-1 rounded-md border-l-2 border-[var(--color-great)] bg-surface-2/70 py-1 pr-1 pl-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-0.5 text-[13px]">
        {variation.moves.map((p, i) => {
          const c = reviewOf(p)?.classification;
          const active = inVar && nav.cursor === i + 1;
          return (
            <Fragment key={i}>
              {(p.color === 'w' || i === 0) && (
                <span className="pl-1 text-subtle">
                  {p.moveNumber}
                  {p.color === 'w' ? '.' : '...'}
                </span>
              )}
              <button
                type="button"
                data-active={active}
                onClick={() => onSelectVariation(i + 1)}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold',
                  active ? 'bg-surface-3 text-fg' : 'text-[var(--color-great)] hover:bg-surface-3',
                )}
              >
                {c && SHOWN.has(c) && <ClassificationIcon classification={c} size={13} />}
                <span className="figurine">{figurine(p.san)}</span>
              </button>
            </Fragment>
          );
        })}
      </div>
      <button type="button" className="rounded p-1 text-subtle hover:bg-surface-3 hover:text-fg" aria-label="Discard line" onClick={onDiscardVariation}>
        <X size={14} />
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className="scroll-thin relative h-full overflow-y-auto px-2 py-1">
      {variation?.base === -1 && variationBlock}
      {rows.map((r, i) => {
        const containsBase = variation && (r.white?.index === variation.base || r.black?.index === variation.base);
        return (
          <Fragment key={i}>
            <div className={cn('grid grid-cols-[2.25rem_1fr_1fr] items-center rounded', i % 2 && 'bg-white/[0.02]')}>
              <span className="pl-1 font-mono text-[12px] text-subtle">{r.number}.</span>
              {r.white ? cell(r.white) : <span className="px-2 text-subtle">…</span>}
              {cell(r.black)}
            </div>
            {containsBase && variationBlock}
          </Fragment>
        );
      })}
    </div>
  );
}
