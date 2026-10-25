'use client';

import { CalendarDays, ChevronRight, Hourglass, Rocket, Timer, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { summaryKey, type ReviewSummary } from '@/hooks/useGameReview';
import { cacheGet } from '@/lib/cache';
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

const CLASS_ICON: Record<TimeClass, LucideIcon> = {
  bullet: Rocket,
  blitz: Zap,
  rapid: Timer,
  classical: Hourglass,
  daily: CalendarDays,
  unknown: Timer,
};

const PAGE = 40;

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

/** Accuracy summaries for games already reviewed on this device. */
function useSummaries(games: GameRecord[]) {
  const [summaries, setSummaries] = useState<Record<string, ReviewSummary>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.all(games.map(async (g) => [g.id, await cacheGet<ReviewSummary>(summaryKey(g.id))] as const)).then((rows) => {
      if (cancelled) return;
      setSummaries(Object.fromEntries(rows.filter((r): r is [string, ReviewSummary] => !!r[1])));
    });
    return () => {
      cancelled = true;
    };
  }, [games]);
  return summaries;
}

export function GameList({ games, onSelect, loadingMore, hasMore, onLoadMore }: GameListProps) {
  const [filter, setFilter] = useState<TimeClass | 'all'>('all');
  const classes = useMemo(() => [...new Set(games.map((g) => g.timeClass))], [games]);
  // Busy players have hundreds of games a month; draw them in batches.
  const [limit, setLimit] = useState(PAGE);
  const matching = filter === 'all' ? games : games.filter((g) => g.timeClass === filter);
  const shown = matching.slice(0, limit);
  const summaries = useSummaries(games);

  return (
    <div>
      {classes.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Filter by time control">
          {(['all', ...classes] as const).map((c) => {
            const Icon = c === 'all' ? null : CLASS_ICON[c];
            return (
              <button key={c} type="button" className="chip shrink-0 py-1.5" data-active={filter === c} onClick={() => {
                  setFilter(c);
                  setLimit(PAGE);
                }}>
                {Icon && <Icon size={14} />}
                {c === 'all' ? 'All' : CLASS_LABEL[c]}
              </button>
            );
          })}
        </div>
      )}

      <ul className="card divide-y divide-line overflow-hidden">
        {shown.map((g) => {
          const me = g.perspective ?? 'w';
          const result = resultFor(g, me);
          const meP = me === 'w' ? g.white : g.black;
          const opp = me === 'w' ? g.black : g.white;
          const Icon = CLASS_ICON[g.timeClass];
          const summary = summaries[g.id];
          const accuracy = summary ? (me === 'w' ? summary.white : summary.black) : null;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onSelect(g)}
                className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-2 sm:px-4"
              >
                <span
                  className={cn(
                    'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg text-[11px] leading-tight font-bold',
                    RESULT_STYLE[result].className,
                  )}
                >
                  <Icon size={15} strokeWidth={2.5} />
                  {RESULT_STYLE[result].label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px]">
                    <span
                      className={cn('size-2.5 shrink-0 rounded-sm', me === 'w' ? 'bg-[#f2f2f2]' : 'bg-[#3e3b37] ring-1 ring-white/30')}
                      aria-label={me === 'w' ? 'Played white' : 'Played black'}
                    />
                    <span className="truncate font-semibold">{opp.name}</span>
                    {opp.rating !== undefined && <span className="shrink-0 text-[13px] text-muted">{opp.rating}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {[formatTimeControl(g.timeControl), formatDate(g.endTime), g.opening].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {accuracy != null ? (
                  <span className="flex shrink-0 flex-col items-end leading-tight" title="Your accuracy">
                    <span className="text-[15px] font-bold tabular-nums">{accuracy.toFixed(1)}</span>
                    <span className="text-[10px] font-semibold tracking-wide text-subtle uppercase">accuracy</span>
                  </span>
                ) : (
                  meP.rating !== undefined && <span className="hidden shrink-0 text-[12.5px] text-subtle sm:block">you {meP.rating}</span>
                )}
                <ChevronRight size={18} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No games in this category.</li>}
      </ul>

      {matching.length > limit && (
        <div className="mt-4 flex justify-center">
          <button type="button" className="btn btn-ghost w-full border border-line py-3 sm:w-auto" onClick={() => setLimit((l) => l + PAGE)}>
            Show more games
          </button>
        </div>
      )}

      {matching.length <= limit && hasMore && (
        <div className="mt-4 flex justify-center">
          <button type="button" className="btn btn-ghost w-full border border-line py-3 sm:w-auto" disabled={loadingMore} onClick={onLoadMore}>
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
          <div className="skeleton size-11" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
