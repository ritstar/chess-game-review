import { PIECE_GLYPH, formatClock } from '@/lib/format';
import type { PlayerInfo } from '@/lib/games/types';
import { cn } from '@/lib/utils';

interface PlayerStripProps {
  player: PlayerInfo;
  color: 'w' | 'b';
  captured: string[];
  materialDiff: number;
  clock?: number;
  toMove: boolean;
  accuracy?: number | null;
}

export function PlayerStrip({ player, color, captured, materialDiff, clock, toMove, accuracy }: PlayerStripProps) {
  return (
    <div className="flex h-11 items-center gap-2.5">
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md text-[15px] font-bold',
          color === 'w' ? 'bg-[#f2f2f2] text-[#2a2825]' : 'bg-[#3e3b37] text-[#f2f2f2] ring-1 ring-white/10',
        )}
        aria-hidden
      >
        {player.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[14px] font-semibold">{player.name}</span>
          {player.rating !== undefined && <span className="text-[13px] text-muted">({player.rating})</span>}
          {accuracy != null && (
            <span className="ml-1 rounded bg-surface-3 px-1.5 text-[11px] font-bold text-fg" title="Accuracy">
              {accuracy.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex h-4 items-center text-[13px] leading-none text-muted" aria-label="Captured pieces">
          {captured.map((p, i) => (
            <span key={i} className={cn('-mr-0.5', color === 'w' ? 'text-[#3e3b37] [-webkit-text-stroke:0.5px_#bbb]' : 'text-[#ddd]')}>
              {PIECE_GLYPH[p]}
            </span>
          ))}
          {materialDiff > 0 && <span className="ml-1.5 text-[12px] font-semibold">+{materialDiff}</span>}
        </div>
      </div>
      {clock !== undefined && (
        <div
          className={cn(
            'rounded-md px-2.5 py-1 font-mono text-[15px] font-semibold tabular-nums',
            toMove ? 'bg-[#f2f2f2] text-[#2a2825]' : 'bg-surface-2 text-muted',
          )}
        >
          {formatClock(clock)}
        </div>
      )}
    </div>
  );
}
