'use client';

import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDate } from '@/lib/format';
import { formatTimeControl, resultFor, type GameRecord, type TimeClass } from '@/lib/games/types';
import { cn } from '@/lib/utils';

const CLASS_LABEL: Record<TimeClass, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  daily: 'Daily',
  unknown: 'Other',
};

const RESULT_STYLE = {
  win: { label: 'Won', className: 'bg-accent text-white' },
  loss: { label: 'Lost', className: 'bg-danger text-white' },
  draw: { label: 'Draw', className: 'bg-surface-3 text-fg' },
};

interface GameListProps {
  games: GameRecord[];
  onSelect: (game: GameRecord) => void;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function GameList({ games, onSelect, loadingMore, hasMore, onLoadMore }: GameListProps) {
  const [filter, setFilter] = useState<TimeClass | 'all'>('all');
  const classes = useMemo(() => [...new Set(games.map((g) => g.timeClass))], [games]);
  const shown = filter === 'all' ? games : games.filter((g) => g.timeClass === filter);

  return (
    <div>
      {classes.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter by time control">
          {(['all', ...classes] as const).map((c) => (
            <button key={c} type="button" className="chip" data-active={filter === c} onClick={() => setFilter(c)}>
              {c === 'all' ? 'All' : CLASS_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      <ul className="card divide-y divide-line overflow-hidden">
        {shown.map((g) => {
          const me = g.perspective ?? 'w';
          const result = resultFor(g, me);
          const meP = me === 'w' ? g.white : g.black;
          const opp = me === 'w' ? g.black : g.white;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onSelect(g)}
                className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'w-12 shrink-0 rounded-md py-1 text-center text-[12px] font-bold',
                    RESULT_STYLE[result].className,
                  )}
                >
                  {RESULT_STYLE[result].label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14.5px]">
                    <span
                      className={cn(
                        'size-2.5 shrink-0 rounded-sm',
                        me === 'w' ? 'bg-[#f2f2f2]' : 'bg-[#3e3b37] ring-1 ring-white/30',
                      )}
                      aria-label={me === 'w' ? 'Played white' : 'Played black'}
                    />
                    <span className="truncate font-semibold">
                      vs {opp.name}
                      {opp.rating !== undefined && <span className="font-normal text-muted"> ({opp.rating})</span>}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {[
                      CLASS_LABEL[g.timeClass],
                      formatTimeControl(g.timeControl),
                      g.opening,
                      meP.rating !== undefined ? `you ${meP.rating}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="hidden shrink-0 text-[12.5px] text-subtle sm:block">{formatDate(g.endTime)}</span>
                <ChevronRight size={18} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No games in this category.</li>}
      </ul>

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button type="button" className="btn btn-ghost border border-line" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Loading…' : 'Load older games'}
          </button>
        </div>
      )}
    </div>
  );
}

export function GameListSkeleton() {
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="skeleton h-6 w-12" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
