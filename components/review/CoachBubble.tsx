import { ChevronRight } from 'lucide-react';
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
  /** 0–1: shows a progress bar under the text (game analysis). */
  progress?: number;
  /** Small label on the bubble's edge, e.g. "Analysis". */
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

/**
 * The coach's speech bubble: what happened on the last move, in words.
 *
 * With `fixed`, the bubble fills the height its parent gives it and long
 * comments scroll inside it, so content changes never move what's below
 * (on phones, the board).
 */
export function CoachBubble({
  message,
  className,
  fixed = false,
  onOpen,
}: {
  message: CoachMessage;
  className?: string;
  fixed?: boolean;
  /** Compact phone variant: two lines, tap to open the full explanation. */
  onOpen?: () => void;
}) {
  const { icon, san, headline, details = [], evaluation, loading, tag, tone = 'default', progress } = message;
  if (onOpen) return <CompactBubble message={message} onOpen={onOpen} className={className} />;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <CoachAvatar className="mt-1 size-12 sm:size-14" />
      <div
        className={cn(
          'relative min-w-0 flex-1 rounded-2xl bg-[#fbfbf9] px-3.5 py-3 text-[#2b2926] shadow-[0_6px_20px_rgba(0,0,0,.25)]',
          fixed ? 'flex h-full flex-col' : 'min-h-[84px]',
          tone === 'success' && 'ring-2 ring-[var(--color-best)]',
          tone === 'error' && 'ring-2 ring-[var(--color-mistake)]',
        )}
        aria-live="polite"
      >
        {/* Tail pointing at the avatar */}
        <span className="absolute top-6 -left-1.5 size-3.5 rotate-45 rounded-[3px] bg-[#fbfbf9]" aria-hidden />
        {/* The tag sits on the bubble's edge so it never adds height. */}
        {tag && (
          <span className="absolute -top-2.5 left-3.5 rounded-full bg-[#3b3834] px-2 py-0.5 text-[10px] leading-none font-bold tracking-wide text-[#ecebe8] uppercase shadow">
            {tag}
          </span>
        )}
        <div className="flex shrink-0 items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 text-[17px] leading-snug font-extrabold">
            {icon && <ClassificationIcon classification={icon} size={26} className="shrink-0" />}
            <span className={cn('min-w-0', fixed && 'line-clamp-2')}>
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
            <div
              className={cn(
                'mt-1.5 space-y-1',
                fixed && 'scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1 [mask-image:linear-gradient(to_bottom,black_82%,transparent)]',
              )}
            >
              <p className="text-[15px] leading-snug">{details[0]}</p>
              {details.slice(1).map((d, i) => (
                <p key={i} className="text-[13px] leading-snug text-[#6b6862]">
                  {d}
                </p>
              ))}
            </div>
          )
        )}
        {progress !== undefined && (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#e6e5e0]" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full rounded-full bg-[var(--color-best)] transition-[width] duration-300" style={{ width: `${Math.max(3, progress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Phone coach: a fixed-height two-line summary; the full text opens in a sheet. */
function CompactBubble({ message, onOpen, className }: { message: CoachMessage; onOpen: () => void; className?: string }) {
  // No eval chip here: the eval bar right above already shows it.
  const { icon, san, headline, details = [], loading, tag, tone = 'default' } = message;
  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <CoachAvatar className="mt-0.5 size-9 self-start rounded-xl p-1" />
      <button
        type="button"
        onClick={onOpen}
        aria-label="Show full explanation"
        className={cn(
          'relative flex min-w-0 flex-1 flex-col rounded-2xl bg-[#fbfbf9] py-2 pr-7 pl-3 text-left text-[#2b2926] shadow-[0_4px_14px_rgba(0,0,0,.25)] active:bg-[#efeee9]',
          tone === 'success' && 'ring-2 ring-[var(--color-best)]',
          tone === 'error' && 'ring-2 ring-[var(--color-mistake)]',
        )}
      >
        <span className="absolute top-3 -left-1 size-3 rotate-45 rounded-[2px] bg-[#fbfbf9]" aria-hidden />
        {tag && (
          <span className="absolute -top-2 left-3 rounded-full bg-[#3b3834] px-1.5 py-0.5 text-[9px] leading-none font-bold tracking-wide text-[#ecebe8] uppercase shadow">
            {tag}
          </span>
        )}
        <span className="flex min-w-0 items-center gap-1.5">
          {icon && <ClassificationIcon classification={icon} size={20} className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-[15px] leading-tight font-extrabold">
            <Headline san={san} headline={headline} />
          </span>
        </span>
        {loading ? (
          <span className="mt-1.5 block h-2.5 w-4/5 animate-pulse rounded bg-[#e6e5e0]" />
        ) : (
          <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#4a4743]">{details[0] ?? ''}</span>
        )}
        <ChevronRight size={16} className="absolute top-1/2 right-1.5 -translate-y-1/2 text-[#9b9892]" aria-hidden />
      </button>
    </div>
  );
}
