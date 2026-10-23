'use client';

import { useEffect, useRef } from 'react';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import type { Classification, MoveReview } from '@/lib/analysis/types';
import type { PlyRecord } from '@/lib/games/pgn';
import { cn } from '@/lib/utils';

/** Classifications worth an icon in the list; the rest would just be noise. */
const SHOWN = new Set<Classification>(['brilliant', 'great', 'best', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']);

interface MoveListProps {
  plies: PlyRecord[];
  moves: (MoveReview | null)[];
  current: number;
  onSelect: (index: number) => void;
}

export function MoveList({ plies, moves, current, onSelect }: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the active move visible without scrolling the page.
  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    const top = active.offsetTop - container.offsetTop;
    if (top < container.scrollTop + 8 || top + active.offsetHeight > container.scrollTop + container.clientHeight - 8) {
      container.scrollTo({ top: top - container.clientHeight / 2, behavior: 'smooth' });
    }
  }, [current]);

  const rows: { number: number; white?: PlyRecord; black?: PlyRecord }[] = [];
  for (const p of plies) {
    if (p.color === 'w' || rows.length === 0) rows.push({ number: p.moveNumber });
    rows[rows.length - 1][p.color === 'w' ? 'white' : 'black'] = p;
  }

  const cell = (p?: PlyRecord) => {
    if (!p) return <div />;
    const review = moves[p.index];
    const active = p.index === current;
    const c = review?.classification;
    return (
      <button
        type="button"
        data-active={active}
        onClick={() => onSelect(p.index)}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md px-2 text-left text-[14px] font-semibold transition-colors',
          active ? 'bg-surface-3 text-fg' : 'text-fg/85 hover:bg-surface-2',
        )}
        style={active && c ? { boxShadow: `inset 0 -2px 0 var(--color-${c})` } : undefined}
      >
        <span className="flex size-4 items-center justify-center">
          {c && SHOWN.has(c) && <ClassificationIcon classification={c} size={16} />}
        </span>
        <span className={cn(c && ['mistake', 'blunder', 'miss'].includes(c) && !active && 'text-fg')}>{p.san}</span>
      </button>
    );
  };

  return (
    <div ref={containerRef} className="scroll-thin relative h-full overflow-y-auto px-2 py-1">
      {rows.map((r, i) => (
        <div key={i} className={cn('grid grid-cols-[2.25rem_1fr_1fr] items-center rounded', i % 2 && 'bg-white/[0.02]')}>
          <span className="pl-1 font-mono text-[12px] text-subtle">{r.number}.</span>
          {r.white ? cell(r.white) : <span className="px-2 text-subtle">…</span>}
          {cell(r.black)}
        </div>
      ))}
    </div>
  );
}
