'use client';

import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useGameReview } from '@/hooks/useGameReview';
import type { Classification } from '@/lib/analysis/types';
import { materialInfo } from '@/lib/format';
import { formatTimeControl, type GameRecord } from '@/lib/games/types';
import { DEPTH_PRESETS, type Settings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Board, type BoardArrow } from './Board';
import { CoachCard } from './CoachCard';
import { EngineLines } from './EngineLines';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { MoveList } from './MoveList';
import { PlayerStrip } from './PlayerStrip';
import { SettingsMenu } from './SettingsMenu';
import { SummaryPanel } from './SummaryPanel';

const SHOW_BEST_FOR = new Set<Classification>(['good', 'excellent', 'inaccuracy', 'mistake', 'miss', 'blunder']);

interface ReviewScreenProps {
  game: GameRecord;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
}

export function ReviewScreen({ game, settings, onSettingsChange, onBack }: ReviewScreenProps) {
  const [runId, setRunId] = useState(0);
  const { parsed, review, status, progress, error } = useGameReview(game, settings.depth, runId);
  const plies = useMemo(() => parsed?.plies ?? [], [parsed]);
  const [current, setCurrent] = useState(-1);
  const [tab, setTab] = useState<'summary' | 'moves'>('summary');
  const [flipped, setFlipped] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hoverUci, setHoverUci] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const perspective = game.perspective ?? 'w';
  const orientation = (perspective === 'w') !== flipped ? 'white' : 'black';
  const last = plies.length - 1;

  const go = useCallback((i: number) => setCurrent(Math.max(-1, Math.min(last, i))), [last]);
  const select = useCallback(
    (i: number) => {
      setPlaying(false);
      go(i);
      setTab('moves');
    },
    [go],
  );

  // Keyboard navigation (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const actions: Record<string, () => void> = {
        ArrowRight: () => go(current + 1),
        ArrowLeft: () => go(current - 1),
        ArrowUp: () => go(-1),
        ArrowDown: () => go(last),
        Home: () => go(-1),
        End: () => go(last),
        f: () => setFlipped((f) => !f),
        ' ': () => setPlaying((p) => !p),
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      if (e.key !== ' ' && e.key !== 'f') {
        setPlaying(false);
        setTab('moves');
      }
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, go, last]);

  // Autoplay.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (current >= last ? setPlaying(false) : go(current + 1)), current >= last ? 0 : 1100);
    return () => clearTimeout(t);
  }, [playing, current, last, go]);

  const ply = current >= 0 ? plies[current] : null;
  const fen = ply?.fenAfter ?? parsed?.startFen ?? new Chess().fen();
  const moveReview = current >= 0 ? (review?.moves[current] ?? null) : null;
  const evaluation = review?.evals[current + 1] ?? null;
  const positionAnalysis = review?.positions[current + 1] ?? null;
  const material = useMemo(() => materialInfo(fen), [fen]);

  const checkSquare = useMemo(() => {
    const c = new Chess(fen);
    if (!c.inCheck()) return null;
    return c.findPiece({ type: 'k', color: c.turn() })[0] ?? null;
  }, [fen]);

  const arrows = useMemo(() => {
    const out: BoardArrow[] = [];
    const toArrow = (uci: string, color: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), color });
    if (hoverUci) out.push(toArrow(hoverUci, 'rgba(70, 140, 220, 0.85)'));
    else if (
      settings.showBestArrow &&
      moveReview?.bestUci &&
      moveReview.bestUci !== ply?.uci &&
      SHOW_BEST_FOR.has(moveReview.classification)
    ) {
      out.push(toArrow(moveReview.bestUci, 'rgba(129, 182, 76, 0.9)'));
    }
    return out;
  }, [hoverUci, settings.showBestArrow, moveReview, ply]);

  // Clock for each side = the clock after their most recent move.
  const clockFor = (color: 'w' | 'b') => {
    for (let i = current; i >= 0; i--) if (plies[i].color === color) return plies[i].clock;
    return plies.find((p) => p.color === color)?.clock;
  };
  const toMove = fen.split(' ')[1] as 'w' | 'b';
  const hasClocks = plies.some((p) => p.clock !== undefined);

  const strip = (color: 'w' | 'b') => (
    <PlayerStrip
      player={color === 'w' ? game.white : game.black}
      color={color}
      captured={material.captured[color]}
      materialDiff={color === 'w' ? material.diff : -material.diff}
      clock={hasClocks ? clockFor(color) : undefined}
      toMove={toMove === color}
      accuracy={color === 'w' ? review?.white.accuracy : review?.black.accuracy}
    />
  );
  const topColor = orientation === 'white' ? 'b' : 'w';
  const bottomColor = orientation === 'white' ? 'w' : 'b';

  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(game.pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; nothing useful to do.
    }
  };

  const analyzing = status === 'analyzing';
  const opening = review?.opening?.name ?? game.opening;
  const resultText = game.result === '1/2-1/2' ? '½–½' : game.result.replace('-', '–');

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pb-10 [--board-size:min(calc(100vw_-_3.75rem),640px)] lg:[--board-size:min(calc(100dvh_-_17rem),calc(100vw_-_31rem),780px)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
        <button type="button" onClick={onBack} className="btn btn-ghost -ml-2 px-2" aria-label="Back to games">
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Games</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold">
            {game.white.name} <span className="font-normal text-muted">vs</span> {game.black.name}
            <span className="ml-2 font-mono text-[15px] text-muted">{resultText}</span>
          </h1>
          <p className="truncate text-[13px] text-muted">
            {[opening, formatTimeControl(game.timeControl), game.termination].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost px-2.5 text-[13px]" onClick={copyPgn}>
            <Copy size={15} /> <span className="hidden sm:inline">{copied ? 'Copied' : 'PGN'}</span>
          </button>
          {game.url && (
            <a href={game.url} target="_blank" rel="noreferrer" className="btn btn-ghost px-2.5 text-[13px]">
              <ExternalLink size={15} />{' '}
              <span className="hidden sm:inline">
                {game.source === 'lichess' ? 'Lichess' : game.source === 'chesscom' ? 'Chess.com' : 'Source'}
              </span>
            </a>
          )}
        </div>
      </div>

      {error && status === 'error' && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <span>{error}</span>
          {parsed && (
            <button type="button" className="btn btn-ghost" onClick={() => setRunId((r) => r + 1)}>
              <RefreshCw size={15} /> Retry
            </button>
          )}
        </div>
      )}

      {parsed && (
        <div className="grid items-start gap-4 lg:grid-cols-[auto_minmax(340px,1fr)]">
          {/* Board column */}
          <section className="mx-auto flex flex-col lg:mx-0" aria-label="Board">
            <div className="pl-[1.75rem]">{strip(topColor)}</div>
            <div className="flex gap-2">
              <div className="w-5 shrink-0" style={{ height: 'var(--board-size)' }}>
                <EvalBar evaluation={evaluation} orientation={orientation} />
              </div>
              <Board
                fen={fen}
                orientation={orientation}
                theme={settings.boardTheme}
                lastMove={ply ? { from: ply.from, to: ply.to } : null}
                classification={moveReview?.classification}
                arrows={arrows}
                checkSquare={checkSquare}
              />
            </div>
            <div className="pl-[1.75rem]">{strip(bottomColor)}</div>

            <div className="mt-1 flex items-center justify-between pl-[1.75rem]">
              <button type="button" className="icon-btn" aria-label="Flip board (F)" title="Flip board (F)" onClick={() => setFlipped((f) => !f)}>
                <Repeat2 size={18} />
              </button>
              <div className="flex items-center gap-0.5">
                <button type="button" className="icon-btn" aria-label="First move" disabled={current < 0} onClick={() => select(-1)}>
                  <ChevronFirst size={22} />
                </button>
                <button type="button" className="icon-btn" aria-label="Previous move" disabled={current < 0} onClick={() => select(current - 1)}>
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={playing ? 'Pause' : 'Play'}
                  onClick={() => {
                    if (current >= last) go(-1);
                    setPlaying((p) => !p);
                    setTab('moves');
                  }}
                >
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button type="button" className="icon-btn" aria-label="Next move" disabled={current >= last} onClick={() => select(current + 1)}>
                  <ChevronRight size={24} />
                </button>
                <button type="button" className="icon-btn" aria-label="Last move" disabled={current >= last} onClick={() => select(last)}>
                  <ChevronLast size={22} />
                </button>
              </div>
              <SettingsMenu settings={settings} onChange={onSettingsChange} />
            </div>
          </section>

          {/* Side panel */}
          <aside className="card flex flex-col overflow-hidden lg:h-[calc(var(--board-size)_+_8.25rem)]" aria-label="Review">
            <div className="flex items-center border-b border-line">
              {(['summary', 'moves'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'relative flex-1 py-3 text-sm font-semibold transition-colors',
                    tab === t ? 'text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {t === 'summary' ? 'Summary' : 'Moves'}
                  {tab === t && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded bg-accent" />}
                </button>
              ))}
            </div>

            {analyzing && (
              <div className="border-b border-line px-4 py-2.5">
                <div className="flex items-center justify-between text-[12px] text-muted">
                  <span className="flex items-center gap-2">
                    <span className="size-3 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                    Analyzing with Stockfish · {DEPTH_PRESETS[settings.depth].label.toLowerCase()}
                  </span>
                  <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded bg-surface-3">
                  <div className="h-full rounded bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            )}

            {tab === 'summary' ? (
              <div className="scroll-thin flex-1 overflow-y-auto">
                <div className="px-4 pt-4">
                  {review ? (
                    <EvalGraph evals={review.evals} moves={review.moves} plies={plies} current={current} onSelect={select} height={88} />
                  ) : (
                    <div className="skeleton h-[88px]" />
                  )}
                </div>
                <SummaryPanel
                  game={game}
                  review={review}
                  plies={plies}
                  onSelect={select}
                  onStart={() => select(Math.max(0, current))}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <CoachCard ply={ply} review={moveReview} evaluation={evaluation} opening={opening} analyzing={analyzing} />
                {review && (
                  <div className="px-4 pb-2">
                    <EvalGraph evals={review.evals} moves={review.moves} plies={plies} current={current} onSelect={go} height={52} />
                  </div>
                )}
                {settings.showEngineLines && (
                  <div className="border-t border-line">
                    <EngineLines analysis={positionAnalysis} onHover={setHoverUci} />
                  </div>
                )}
                <div className="h-[45vh] min-h-[220px] flex-1 border-t border-line lg:h-auto lg:min-h-0">
                  <MoveList plies={plies} moves={review?.moves ?? []} current={current} onSelect={select} />
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
