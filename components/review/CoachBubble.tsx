import { defaultPieces } from 'react-chessboard';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import type { Classification, EvalPoint } from '@/lib/analysis/types';
import { formatScore } from '@/lib/engine/uci';
import { figurine } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface CoachMessage {
  icon?: Classification | null;
  /** Leading SAN in the headline, rendered with a figurine. */
  san?: string;
  headline: string;
  details?: string[];
  evaluation?: EvalPoint | null;
  loading?: boolean;
  /** Small pill above the headline, e.g. "Your move" in analysis. */
  tag?: string;
  tone?: 'default' | 'success' | 'error';
}

export function CoachAvatar({ className }: { className?: string }) {
  const Knight = defaultPieces.wN;
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-[#95c95d] to-[#5d8a2f] p-1.5 shadow-lg',
        className,
      )}
      aria-hidden
    >
      <div className="size-full drop-shadow-[0_2px_2px_rgba(0,0,0,.35)]">{Knight?.()}</div>
    </div>
  );
}

function Headline({ san, headline }: { san?: string; headline: string }) {
  if (san && headline.startsWith(san)) {
    return (
      <>
        <span className="figurine">{figurine(san)}</span>
        {headline.slice(san.length)}
      </>
    );
  }
  return <>{headline}</>;
}

/** The coach's speech bubble: what happened on the last move, in words. */
export function CoachBubble({ message, className }: { message: CoachMessage; className?: string }) {
  const { icon, san, headline, details = [], evaluation, loading, tag, tone = 'default' } = message;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <CoachAvatar className="mt-1 size-12 sm:size-14" />
      <div
        className={cn(
          'relative min-h-[84px] min-w-0 flex-1 rounded-2xl bg-[#fbfbf9] px-3.5 py-3 text-[#2b2926] shadow-[0_6px_20px_rgba(0,0,0,.25)]',
          tone === 'success' && 'ring-2 ring-[var(--color-best)]',
          tone === 'error' && 'ring-2 ring-[var(--color-mistake)]',
        )}
        aria-live="polite"
      >
        {/* Tail pointing at the avatar */}
        <span className="absolute top-6 -left-1.5 size-3.5 rotate-45 rounded-[3px] bg-[#fbfbf9]" aria-hidden />
        {tag && (
          <span className="mb-1 inline-block rounded-full bg-[#ecebe6] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#6b6862] uppercase">
            {tag}
          </span>
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-[17px] leading-snug font-extrabold">
            {icon && <ClassificationIcon classification={icon} size={26} className="shrink-0" />}
            <span className="min-w-0">
              <Headline san={san} headline={headline} />
            </span>
          </p>
          {evaluation && (
            <span className="shrink-0 rounded-md bg-[#e9e8e4] px-2 py-1 font-mono text-[13px] font-bold text-[#2b2926]">
              {evaluation.terminal === 'checkmate' ? '#' : formatScore(evaluation.score)}
            </span>
          )}
        </div>
        {loading ? (
          <div className="mt-2.5 space-y-2">
            <div className="h-3 w-11/12 animate-pulse rounded bg-[#e6e5e0]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-[#e6e5e0]" />
          </div>
        ) : (
          details.length > 0 && (
            <div className="mt-1.5 space-y-1">
              <p className="text-[15px] leading-snug">{details[0]}</p>
              {details.slice(1).map((d, i) => (
                <p key={i} className="text-[13px] leading-snug text-[#6b6862]">
                  {d}
                </p>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
