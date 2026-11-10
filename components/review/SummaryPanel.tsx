import { ClassificationIcon } from '@/components/ClassificationIcon';
import { PlayerAvatar, PlayerTitle } from '@/components/PlayerAvatar';
import type { Phase } from '@/lib/analysis/phases';
import { gameRating } from '@/lib/analysis/rating';
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, type GameReview } from '@/lib/analysis/types';
import type { PlyRecord } from '@/lib/games/pgn';
import type { GameRecord } from '@/lib/games/types';
import { cn } from '@/lib/utils';

interface SummaryPanelProps {
  game: GameRecord;
  review: GameReview | null;
  plies: PlyRecord[];
  onSelect: (index: number) => void;
  onStart: () => void;
}

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' };

/** Label on the left, White's value, an icon, Black's value: the report-card grid. */
const ROW = 'grid grid-cols-[minmax(0,1fr)_4.75rem_1.75rem_4.75rem] items-center gap-x-1 sm:grid-cols-[minmax(0,1fr)_5.5rem_2rem_5.5rem]';

function ScoreBox({ value, color, digits = 1 }: { value: number | null | undefined; color: 'w' | 'b'; digits?: number }) {
  return (
    <span
      className={cn(
        'mx-auto block w-[4.25rem] rounded-md py-1 text-center text-[19px] leading-tight font-extrabold tabular-nums',
        color === 'w' ? 'bg-[#f2f2f2] text-[#2a2825]' : 'bg-[#3e3b37] text-[#f2f2f2] ring-1 ring-white/10',
      )}
    >
      {value == null ? <span className="opacity-40">—</span> : value.toFixed(digits)}
    </span>
  );
}

export function SummaryPanel({ game, review, plies, onSelect, onStart }: SummaryPanelProps) {
  const rows = CLASSIFICATIONS.filter((c) => c !== 'forced' || (review && review.white.counts.forced + review.black.counts.forced > 0));
  const done = !!review?.complete;
  const movesBy = (color: 'w' | 'b') => plies.filter((p) => p.color === color).length;
  const rating = (color: 'w' | 'b') =>
    done ? gameRating((color === 'w' ? review.white : review.black).accuracy, (color === 'w' ? game.white : game.black).rating, game.timeClass, movesBy(color)) : null;
  const label = 'text-[14px] font-semibold text-fg/90';

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="space-y-3">
        <div className={ROW}>
          <span className={label}>Players</span>
          {(['w', 'b'] as const).map((color) => {
            const player = color === 'w' ? game.white : game.black;
            return (
              <span key={color} className={cn('flex min-w-0 flex-col items-center gap-1', color === 'b' && 'col-start-4')}>
                <PlayerAvatar source={game.source} name={player.name} color={color} className="size-11 text-[18px]" />
                <span className="flex max-w-full items-center gap-1 text-[12px] leading-tight text-muted">
                  <PlayerTitle source={game.source} name={player.name} />
                  <span className="truncate">{player.name}</span>
                </span>
              </span>
            );
          })}
        </div>
        <div className={ROW}>
          <span className={label}>Accuracy</span>
          <ScoreBox value={review?.white.accuracy} color="w" />
          <span />
          <ScoreBox value={review?.black.accuracy} color="b" />
        </div>
      </div>

      <div className="border-y border-line/70 py-1.5">
        {rows.map((c) => (
          <div key={c} className={cn(ROW, 'py-[5px]')}>
            <span className="text-[14px] text-fg/85">{CLASSIFICATION_LABEL[c]}</span>
            <span className="text-center text-[15px] font-bold tabular-nums" style={{ color: `var(--color-${c})` }}>
              {review ? review.white.counts[c] : '·'}
            </span>
            <span className="flex justify-center">
              <ClassificationIcon classification={c} size={20} />
            </span>
            <span className="text-center text-[15px] font-bold tabular-nums" style={{ color: `var(--color-${c})` }}>
              {review ? review.black.counts[c] : '·'}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        <div className={ROW}>
          <span className={label} title="An estimate: the player's rating, moved up or down by how accurately they played compared with a typical game at that rating and time control.">
            Game Rating
          </span>
          <ScoreBox value={rating('w')} color="w" digits={0} />
          <span />
          <ScoreBox value={rating('b')} color="b" digits={0} />
        </div>
        {review?.phases.map((p) => (
          <button key={p.phase} type="button" onClick={() => onSelect(p.from)} className={cn(ROW, 'w-full py-0.5 text-left')} title={`Jump to the ${p.phase}`}>
            <span className={label}>{PHASE_LABEL[p.phase]}</span>
            <span className="flex justify-center">{p.white ? <ClassificationIcon classification={p.white} size={24} /> : <span className="text-subtle">–</span>}</span>
            <span />
            <span className="flex justify-center">{p.black ? <ClassificationIcon classification={p.black} size={24} /> : <span className="text-subtle">–</span>}</span>
          </button>
        ))}
      </div>

      {review && review.keyMoments.length > 0 && (
        <div className="border-t border-line/70 pt-3">
          <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Key moments</p>
          <div className="mt-2 space-y-0.5">
            {review.keyMoments.map((i) => {
              const m = review.moves[i]!;
              const p = plies[i];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelect(i)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 active:bg-surface-2"
                >
                  <ClassificationIcon classification={m.classification} size={20} />
                  <span className="shrink-0 font-mono text-[13px] font-semibold whitespace-nowrap">
                    {p.moveNumber}
                    {p.color === 'w' ? '.' : '…'} {p.san}
                  </span>
                  <span className="truncate text-[13px] text-muted">{m.explanation.details[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button type="button" className="btn btn-primary hidden w-full py-3 text-[15px] lg:inline-flex" onClick={onStart}>
        Start review
      </button>
    </div>
  );
}
