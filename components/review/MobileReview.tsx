'use client';

import { ArrowLeft, BarChart3, Copy, Eye, ExternalLink, Github, MoreHorizontal, Repeat2, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClassificationIcon } from '@/components/ClassificationIcon';
import { Sheet } from '@/components/ui/Sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatLine } from '@/lib/analysis/explain';
import type { EvalPoint, GameReview, MoveReview } from '@/lib/analysis/types';
import { formatScore, type PositionAnalysis } from '@/lib/engine/uci';
import { figurine } from '@/lib/format';
import type { PlyRecord } from '@/lib/games/pgn';
import type { GameRecord } from '@/lib/games/types';
import type { NavState } from '@/lib/review/navigation';
import type { Settings } from '@/lib/settings';
import { AUTHOR, REPO_URL } from '@/lib/site';
import { cn } from '@/lib/utils';
import { ActionBar, type Action, type PrimaryAction } from './ActionBar';
import { CoachBubble, type CoachMessage } from './CoachBubble';
import { EngineLines } from './EngineLines';
import { EvalGraph } from './EvalGraph';
import { HorizontalEvalBar } from './HorizontalEvalBar';
import { MoveStrip } from './MoveStrip';
import { SettingsFields } from './SettingsMenu';
import { SummaryPanel } from './SummaryPanel';

export interface MobileReviewProps {
  game: GameRecord;
  mode: 'summary' | 'review';
  onModeChange: (mode: 'summary' | 'review') => void;
  onBack: () => void;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;

  coach: CoachMessage;
  moveReview: MoveReview | null;
  shownPly: PlyRecord | null;
  evaluation: EvalPoint | null;
  analysis: PositionAnalysis | null;
  board: React.ReactNode;
  topStrip: React.ReactNode;
  bottomStrip: React.ReactNode;

  plies: PlyRecord[];
  review: GameReview | null;
  nav: NavState;
  reviewOf: (p: PlyRecord) => MoveReview | null;
  goto: (index: number) => void;
  gotoVariation: (cursor: number) => void;
  stepBack: () => void;
  stepForward: () => void;
  atStart: boolean;
  atEnd: boolean;
  onPlayUci: (uci: string) => void;
  onShowBest: () => void;
  onShowFollowUp: () => void;
  canBest: boolean;
  canShow: boolean;

  actions: Action[];
  primary: PrimaryAction;
  analyzing: boolean;
  progress: number;
  onFlip: () => void;
  onCopyPgn: () => void;
  copied: boolean;
}

/**
 * The phone layout. Review mode is a full-screen app view that never
 * scrolls: header, eval bar, a two-line coach, the board (sized to whatever
 * height is left), the move strip and a thumb-reach action bar. Details and
 * settings live in bottom sheets. The summary is a normal scrolling page.
 */
export function MobileReview(p: MobileReviewProps) {
  const [sheet, setSheet] = useState<'details' | 'menu' | null>(null);
  const landscape = useMediaQuery('(orientation: landscape) and (max-height: 560px)');
  // Player bars are nice-to-have; on shorter screens the board gets their space.
  const roomy = useMediaQuery('(min-height: 760px)');
  const closeSheet = () => setSheet(null);

  // No pull-to-refresh or rubber-banding while reviewing: a downward drag on
  // a piece must never reload the page.
  useEffect(() => {
    if (p.mode !== 'review') return;
    document.documentElement.classList.add('app-locked');
    return () => document.documentElement.classList.remove('app-locked');
  }, [p.mode]);

  const progressBar = p.analyzing && (
    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-3" aria-hidden>
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${p.progress * 100}%` }} />
    </div>
  );

  const header = (
    <header className="relative flex h-11 shrink-0 items-center gap-1 px-1">
      <button type="button" onClick={p.onBack} className="icon-btn" aria-label="Back to games">
        <ArrowLeft size={22} />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-[16px] leading-tight font-extrabold">{p.mode === 'summary' ? 'Game Summary' : 'Game Review'}</p>
        <p className="truncate text-[11.5px] leading-tight text-muted">
          {p.game.white.name} vs {p.game.black.name}
        </p>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label={p.mode === 'summary' ? 'Back to the board' : 'Game summary'}
        onClick={() => p.onModeChange(p.mode === 'summary' ? 'review' : 'summary')}
      >
        <BarChart3 size={20} className={cn(p.mode === 'summary' && 'text-accent')} />
      </button>
      <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setSheet('menu')}>
        <MoreHorizontal size={22} />
      </button>
      {progressBar}
    </header>
  );

  const sheets = (
    <>
      <Sheet open={sheet === 'details'} onClose={closeSheet} title={<DetailsTitle coach={p.coach} />}>
        <Details {...p} onDone={closeSheet} />
      </Sheet>
      <Sheet open={sheet === 'menu'} onClose={closeSheet} title="Menu">
        <MenuContent {...p} onDone={closeSheet} />
      </Sheet>
    </>
  );

  if (p.mode === 'summary') {
    return (
      <div className="min-h-dvh bg-bg">
        <div className="sticky top-0 z-30 border-b border-line/70 bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">{header}</div>
        <div className="mx-auto max-w-xl space-y-4 px-3 pt-3 pb-32">
          <CoachBubble message={p.coach} />
          {p.review ? (
            <EvalGraph evals={p.review.evals} moves={p.review.moves} plies={p.plies} current={p.nav.current} onSelect={p.goto} height={84} />
          ) : (
            <div className="skeleton h-[84px]" />
          )}
          <div className="card overflow-hidden">
            <SummaryPanel game={p.game} review={p.review} plies={p.plies} onSelect={p.goto} onStart={() => p.goto(0)} />
          </div>
        </div>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
          <ActionBar actions={p.actions} primary={p.primary} />
        </div>
        {sheets}
      </div>
    );
  }

  const engineRow = p.settings.showEngineLines && (
    <div className="shrink-0 border-t border-line/60">
      <EngineLines analysis={p.analysis} onOpen={() => setSheet('details')} />
    </div>
  );
  const strip = (
    <div className="shrink-0">
      <MoveStrip
        compact
        plies={p.plies}
        moves={p.review?.moves ?? []}
        nav={p.nav}
        reviewOf={p.reviewOf}
        onSelectMain={p.goto}
        onSelectVariation={p.gotoVariation}
        onPrev={p.stepBack}
        onNext={p.stepForward}
        canPrev={!p.atStart}
        canNext={!p.atEnd}
      />
    </div>
  );
  const actionBar = (
    <div className="shrink-0 border-t border-line bg-bg px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      <ActionBar actions={p.actions} primary={p.primary} compact />
    </div>
  );
  const coach = <CoachBubble message={p.coach} onOpen={() => setSheet('details')} className="h-[68px] shrink-0" />;
  // The board takes the space that's left: a size container, and the board is
  // as big as its smaller side.
  const boardRegion = (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center [container-type:size]">
      <div className="[--board-size:min(100cqw,100cqh)]">{p.board}</div>
    </div>
  );

  if (landscape) {
    return (
      <div className="fixed inset-0 flex bg-bg pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <div className="flex h-full py-1 pl-1 [width:min(100dvh,60vw)]">{boardRegion}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          <div className="space-y-2 px-2 pb-1">
            <HorizontalEvalBar evaluation={p.evaluation} className="h-[18px]" />
            {coach}
          </div>
          <div className="px-2">{p.topStrip}</div>
          <div className="px-2">{p.bottomStrip}</div>
          <div className="mt-auto">
            {strip}
            {engineRow}
            {actionBar}
          </div>
        </div>
        {sheets}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-bg pt-[env(safe-area-inset-top)]">
      {header}
      <div className="shrink-0 space-y-2 px-2.5 pb-2">
        <HorizontalEvalBar evaluation={p.evaluation} className="h-[18px]" />
        {coach}
      </div>
      {roomy && <div className="shrink-0 px-2.5">{p.topStrip}</div>}
      {boardRegion}
      {roomy && <div className="shrink-0 px-2.5">{p.bottomStrip}</div>}
      {strip}
      {engineRow}
      {actionBar}
      {sheets}
    </div>
  );
}

function DetailsTitle({ coach }: { coach: CoachMessage }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {coach.icon && <ClassificationIcon classification={coach.icon} size={22} />}
      <span className="truncate">
        {coach.san && coach.headline.startsWith(coach.san) ? (
          <>
            <span className="figurine">{figurine(coach.san)}</span>
            {coach.headline.slice(coach.san.length)}
          </>
        ) : (
          coach.headline
        )}
      </span>
    </span>
  );
}

/** Everything the compact coach leaves out: full explanation, best line, engine lines. */
function Details(p: MobileReviewProps & { onDone: () => void }) {
  const { coach, moveReview, shownPly, analysis } = p;
  return (
    <div className="space-y-4 pt-1">
      {coach.loading ? (
        <p className="text-[14px] text-muted">Analyzing this move…</p>
      ) : (
        <div className="space-y-1.5">
          {(coach.details ?? []).map((d, i) => (
            <p key={i} className={i === 0 ? 'text-[15px] leading-snug' : 'text-[14px] leading-snug text-muted'}>
              {d}
            </p>
          ))}
          {p.evaluation && (
            <p className="text-[13px] text-subtle">
              Evaluation <span className="font-mono font-semibold text-muted">{formatScore(p.evaluation.score)}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn border border-line bg-surface-2 py-3"
          disabled={!p.canBest}
          onClick={() => {
            p.onShowBest();
            p.onDone();
          }}
        >
          <Star size={16} /> Best move
        </button>
        <button
          type="button"
          className="btn border border-line bg-surface-2 py-3"
          disabled={!p.canShow}
          onClick={() => {
            p.onShowFollowUp();
            p.onDone();
          }}
        >
          <Eye size={16} /> Follow-up
        </button>
      </div>

      {moveReview && shownPly && moveReview.bestLine.length > 0 && moveReview.bestUci !== shownPly.uci && (
        <div className="rounded-lg bg-surface-2 px-3 py-2.5">
          <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Best line</p>
          <p className="mt-1 font-mono text-[13px] leading-relaxed text-fg/90">{formatLine(shownPly.fenBefore, moveReview.bestLine, 10)}</p>
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Engine · tap a line to play it</p>
        <div className="-mx-2 mt-1">
          <EngineLines
            analysis={analysis}
            onPlay={(uci) => {
              p.onPlayUci(uci);
              p.onDone();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MenuContent(p: MobileReviewProps & { onDone: () => void }) {
  const row = 'flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left text-[15px] active:bg-surface-2';
  return (
    <div className="space-y-4 pt-1">
      <div className="-mx-2">
        <button
          type="button"
          className={row}
          onClick={() => {
            p.onModeChange(p.mode === 'summary' ? 'review' : 'summary');
            p.onDone();
          }}
        >
          <BarChart3 size={20} className="text-muted" /> {p.mode === 'summary' ? 'Back to the board' : 'Game summary'}
        </button>
        <button
          type="button"
          className={row}
          onClick={() => {
            p.onFlip();
            p.onDone();
          }}
        >
          <Repeat2 size={20} className="text-muted" /> Flip board
        </button>
        <button type="button" className={row} onClick={p.onCopyPgn}>
          <Copy size={20} className="text-muted" /> {p.copied ? 'Copied!' : 'Copy PGN'}
        </button>
        {p.game.url && (
          <a href={p.game.url} target="_blank" rel="noreferrer" className={row}>
            <ExternalLink size={20} className="text-muted" /> Open on{' '}
            {p.game.source === 'lichess' ? 'Lichess' : p.game.source === 'chesscom' ? 'Chess.com' : 'the source site'}
          </a>
        )}
      </div>
      <SettingsFields settings={p.settings} onChange={p.onSettingsChange} />
      <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-subtle">
        <Github size={14} /> github.com/{AUTHOR}
      </a>
    </div>
  );
}
