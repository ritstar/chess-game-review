'use client';

import {
  ArrowLeft,
  BarChart3,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Star,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { useExplorer } from '@/hooks/useExplorer';
import { useGameReview } from '@/hooks/useGameReview';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { evalPoint } from '@/lib/analysis/review';
import { detectFork, detectThreats } from '@/lib/analysis/tactics';
import { CLASSIFICATION_LABEL, type Classification, type GameReview, type MoveReview } from '@/lib/analysis/types';
import { winPercent } from '@/lib/analysis/winning';
import { scoreToCp } from '@/lib/engine/uci';
import { materialInfo } from '@/lib/format';
import { makePly, pliesFromSan, pliesFromUci, type PlyRecord } from '@/lib/games/pgn';
import { formatTimeControl, resultFor, type GameRecord } from '@/lib/games/types';
import { haptic, hapticForSan } from '@/lib/haptics';
import { inVariation, initialNav, navReducer, shownPly } from '@/lib/review/navigation';
import { DEPTH_PRESETS, type Settings } from '@/lib/settings';
import { playSound, soundForSan } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { ActionBar, type Action, type PrimaryAction } from './ActionBar';
import { Board, type BoardArrow, type BoardMove } from './Board';
import { CoachBubble, type CoachMessage } from './CoachBubble';
import { EngineLines } from './EngineLines';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { HorizontalEvalBar } from './HorizontalEvalBar';
import { MoveList } from './MoveList';
import { MoveStrip } from './MoveStrip';
import { PlayerStrip } from './PlayerStrip';
import { SettingsMenu } from './SettingsMenu';
import { SummaryPanel } from './SummaryPanel';

const GOOD = new Set<Classification>(['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced']);
const ERRORS = new Set<Classification>(['inaccuracy', 'mistake', 'miss', 'blunder']);
const SHOW_BEST_FOR = new Set<Classification>(['good', 'excellent', 'inaccuracy', 'mistake', 'miss', 'blunder']);
/** Win% a retry attempt may give up versus the best move and still count. */
const RETRY_TOLERANCE = 5;
const LINE_PLIES = 6;

interface ReviewScreenProps {
  game: GameRecord;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onBack: () => void;
}

function listJoin(items: string[]) {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function article(c: Classification) {
  return /^[aeiou]/i.test(CLASSIFICATION_LABEL[c]) ? 'an' : 'a';
}

function summaryMessage(game: GameRecord, review: GameReview | null, analyzing: boolean, progress: number): CoachMessage {
  if (!review?.complete) {
    return {
      headline: analyzing ? `Analyzing your game… ${Math.round(progress * 100)}%` : 'Getting ready…',
      details: ['Stockfish is checking every move. You can start stepping through already.'],
      loading: !review,
    };
  }
  const me = game.perspective;
  const opening = review.opening?.name ?? game.opening;
  if (!me) {
    return {
      headline: `${game.white.name} vs ${game.black.name}`,
      details: [
        `White played with ${review.white.accuracy?.toFixed(1)}% accuracy, Black with ${review.black.accuracy?.toFixed(1)}%.`,
        ...(opening ? [opening] : []),
      ],
    };
  }
  const mine = me === 'w' ? review.white : review.black;
  const result = resultFor(game, me);
  const errors = [
    mine.counts.blunder && `${mine.counts.blunder} blunder${mine.counts.blunder > 1 ? 's' : ''}`,
    mine.counts.mistake && `${mine.counts.mistake} mistake${mine.counts.mistake > 1 ? 's' : ''}`,
    mine.counts.miss && `${mine.counts.miss} miss${mine.counts.miss > 1 ? 'es' : ''}`,
  ].filter(Boolean);
  const highlights = mine.counts.brilliant
    ? `You found ${mine.counts.brilliant} brilliant move${mine.counts.brilliant > 1 ? 's' : ''}!`
    : mine.counts.great
      ? `You found ${mine.counts.great} great move${mine.counts.great > 1 ? 's' : ''}.`
      : null;
  return {
    headline: result === 'win' ? 'Well played!' : result === 'loss' ? 'A tough one.' : 'A hard-fought draw.',
    details: [
      `You played with ${mine.accuracy?.toFixed(1)}% accuracy${errors.length ? `, with ${listJoin(errors as string[])}` : ' and no serious errors'}.`,
      ...(highlights ? [highlights] : []),
      ...(opening ? [opening] : []),
    ],
  };
}

export function ReviewScreen({ game, settings, onSettingsChange, onBack }: ReviewScreenProps) {
  const [runId, setRunId] = useState(0);
  const { parsed, review, status, progress, error } = useGameReview(game, settings.depth, runId);
  const plies = useMemo(() => parsed?.plies ?? [], [parsed]);
  const startFen = parsed?.startFen ?? DEFAULT_POSITION;
  const reducer = useMemo(() => navReducer(plies, startFen), [plies, startFen]);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [nav, dispatch] = useReducer(reducer, initialNav);
  const [mode, setMode] = useState<'summary' | 'review'>('summary');
  const [flipped, setFlipped] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hoverUci, setHoverUci] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState<{ index: number; note?: 'same' } | null>(null);
  /** Set by handlers so the next position change also triggers haptics. */
  const userAction = useRef(false);

  const perspective = game.perspective;
  const orientation = ((perspective ?? 'w') === 'w') !== flipped ? 'white' : 'black';
  const last = plies.length - 1;
  const isVar = inVariation(nav);
  const variation = nav.variation;
  const ply = shownPly(nav, plies);
  const fen = ply?.fenAfter ?? startFen;

  /* ── Analysis for what's on the board ─────────────────────────────── */

  const known = useMemo(() => {
    const m = new Map<string, NonNullable<GameReview['positions'][number]>>();
    review?.positions.forEach((p) => p && m.set(p.fen, p));
    return m;
  }, [review]);

  const prevPly = isVar ? (nav.cursor > 1 ? variation!.moves[nav.cursor - 2] : plies[variation!.base]) : undefined;
  const explorer = useExplorer({
    ply: isVar ? ply : null,
    prevPly,
    prevClassification: isVar && nav.cursor === 1 ? review?.moves[variation!.base]?.classification : undefined,
    known,
    depth: settings.depth,
    perspective,
  });

  const moveReview: MoveReview | null = isVar
    ? explorer.reviewOf(ply)
    : nav.current >= 0
      ? (review?.moves[nav.current] ?? null)
      : null;
  const analysis = isVar ? explorer.live : (review?.positions[nav.current + 1] ?? null);
  const evaluation = isVar ? (analysis ? evalPoint(analysis) : null) : (review?.evals[nav.current + 1] ?? null);
  const atEnd = isVar ? nav.cursor >= variation!.moves.length : nav.current >= last;
  const atStart = !isVar && nav.current < 0;

  /* ── Navigation ───────────────────────────────────────────────────── */

  // Stable handlers (they only touch setters, dispatch and refs) so the
  // memoised move list, strip and graph don't re-render on every step.
  const goto = useCallback((index: number) => {
    userAction.current = true;
    setPlaying(false);
    setRetry(null);
    dispatch({ type: 'goto', index });
    setMode('review');
  }, []);
  const gotoVariation = useCallback((cursor: number) => {
    userAction.current = true;
    setPlaying(false);
    setRetry(null);
    dispatch({ type: 'gotoVariation', cursor });
    setMode('review');
  }, []);
  const step = useCallback((delta: 1 | -1) => {
    userAction.current = true;
    setPlaying(false);
    setRetry(null);
    dispatch({ type: 'step', delta });
    setMode('review');
  }, []);
  const stepBack = useCallback(() => step(-1), [step]);
  const stepForward = useCallback(() => step(1), [step]);
  const backToGame = useCallback(() => {
    userAction.current = true;
    setPlaying(false);
    setRetry(null);
    dispatch({ type: 'backToGame' });
  }, []);
  const undo = () => {
    userAction.current = true;
    setPlaying(false);
    dispatch({ type: 'undo' });
  };

  /* ── Moves on the board ───────────────────────────────────────────── */

  const feedback = (sound: Parameters<typeof playSound>[0], kind: Parameters<typeof haptic>[0]) => {
    if (settings.sound) playSound(sound);
    if (settings.haptics) haptic(kind);
  };

  const playMove = (move: BoardMove | string, dragged = false) => {
    const next = makePly(fen, move, isVar ? nav.cursor : 0);
    if (!next) return;
    setPlaying(false);
    setMode('review');
    if (retry && !isVar && nav.current === retry.index - 1 && next.uci === plies[retry.index]?.uci) {
      // Retrying a mistake by replaying it.
      setRetry({ index: retry.index, note: 'same' });
      feedback('wrong', 'error');
      return;
    }
    if (retry) setRetry({ index: retry.index });
    userAction.current = true;
    dispatch({ type: 'play', ply: next, animate: !dragged });
  };

  const startRetry = () => {
    if (nav.current < 0) return;
    userAction.current = true;
    setPlaying(false);
    dispatch({ type: 'goto', index: nav.current - 1 });
    setRetry({ index: nav.current });
  };

  /** Play the engine's continuation from the current position. */
  const showFollowUp = () => {
    const pv = analysis?.lines[0]?.pv;
    if (!pv?.length) return;
    const cont = pliesFromUci(fen, pv.slice(0, LINE_PLIES));
    userAction.current = true;
    if (isVar) {
      dispatch({ type: 'setLine', base: variation!.base, moves: [...variation!.moves.slice(0, nav.cursor), ...cont], cursor: nav.cursor + 1 });
    } else {
      dispatch({ type: 'setLine', base: nav.current, moves: cont, cursor: 1 });
    }
    setRetry(null);
    setPlaying(true);
  };

  /** Replace the move on the board with the engine's best, followed by its line. */
  const showBest = (target: PlyRecord | null = ply, targetReview: MoveReview | null = moveReview) => {
    if (!target || !targetReview?.bestLine.length) return;
    const best = pliesFromSan(target.fenBefore, targetReview.bestLine.slice(0, LINE_PLIES));
    userAction.current = true;
    setPlaying(false);
    if (isVar && target === ply) {
      dispatch({ type: 'setLine', base: variation!.base, moves: [...variation!.moves.slice(0, nav.cursor - 1), ...best], cursor: nav.cursor });
    } else {
      dispatch({ type: 'setLine', base: target.index - 1, moves: best, cursor: 1 });
    }
  };

  /* ── Retry ────────────────────────────────────────────────────────── */

  const retryAttempt = retry && isVar && variation?.base === retry.index - 1 ? variation.moves[0] : null;
  const attemptReview = explorer.reviewOf(retryAttempt);
  const retryVerdict: 'correct' | 'wrong' | 'checking' | null = (() => {
    if (!retryAttempt || !retry) return null;
    const before = review?.positions[retry.index];
    const top = before?.lines[0];
    const line = before?.lines.find((l) => l.pv[0] === retryAttempt.uci);
    if (top && line && winPercent(scoreToCp(top.score)) - winPercent(scoreToCp(line.score)) <= RETRY_TOLERANCE) return 'correct';
    if (!attemptReview) return 'checking';
    return GOOD.has(attemptReview.classification) ? 'correct' : 'wrong';
  })();

  const verdictKey = retryAttempt && retryVerdict !== 'checking' ? `${retryAttempt.uci}:${retryVerdict}` : null;
  useEffect(() => {
    if (!verdictKey) return;
    const correct = verdictKey.endsWith(':correct');
    if (settings.sound) playSound(correct ? 'correct' : 'wrong');
    if (settings.haptics) haptic(correct ? 'success' : 'error');
    // On phones the coach bubble sits above the board; bring the verdict into view.
    if (window.matchMedia('(max-width: 1023px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
    if (correct) return;
    // Take a wrong attempt back so the user can try again.
    const t = setTimeout(() => dispatch({ type: 'backToGame' }), 1400);
    return () => clearTimeout(t);
    // Only react to a new verdict.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictKey]);

  /* ── Sound and haptics on every position change ───────────────────── */

  const moveKey = isVar ? `v${nav.cursor}:${ply?.uci}` : `m${nav.current}`;
  const lastMoveKey = useRef(moveKey);
  useEffect(() => {
    if (lastMoveKey.current === moveKey) return;
    lastMoveKey.current = moveKey;
    const byUser = userAction.current;
    userAction.current = false;
    if (!ply) return;
    if (settings.sound) playSound(soundForSan(ply.san));
    if (settings.haptics && byUser) haptic(hapticForSan(ply.san));
    // Only the position change matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey]);

  /* ── Keyboard ─────────────────────────────────────────────────────── */

  const keyActions = useRef<Record<string, () => void>>({});
  keyActions.current = {
    ArrowRight: () => step(1),
    ArrowLeft: () => step(-1),
    ArrowUp: () => goto(-1),
    Home: () => goto(-1),
    ArrowDown: () => goto(last),
    End: () => goto(last),
    f: () => setFlipped((v) => !v),
    ' ': () => setPlaying((p) => !p),
    Escape: () => (retry || isVar ? backToGame() : undefined),
    Backspace: () => (isVar ? undo() : undefined),
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const action = keyActions.current[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Autoplay through the game, or through a line being shown.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (atEnd ? setPlaying(false) : dispatch({ type: 'step', delta: 1 })), atEnd ? 0 : 1000);
    return () => clearTimeout(t);
  }, [playing, atEnd, nav]);

  /* ── Board decorations ────────────────────────────────────────────── */

  const threat = useMemo(() => {
    if (!ply || !moveReview || !/^(Attacks|Forks)/.test(moveReview.explanation.details[0] ?? '')) return null;
    return detectFork(ply.fenBefore, ply.uci) ?? detectThreats(ply.fenBefore, ply.uci);
  }, [ply, moveReview]);

  const arrows = useMemo(() => {
    const out: BoardArrow[] = [];
    const toArrow = (from: string, to: string, color: string) => ({ from, to, color });
    if (hoverUci) return [toArrow(hoverUci.slice(0, 2), hoverUci.slice(2, 4), 'rgba(70, 140, 220, 0.85)')];
    if (threat) threat.targets.forEach((t) => out.push(toArrow(threat.square, t.square, 'rgba(230, 70, 60, 0.85)')));
    if (
      settings.showBestArrow &&
      moveReview?.bestUci &&
      moveReview.bestUci !== ply?.uci &&
      SHOW_BEST_FOR.has(moveReview.classification)
    ) {
      out.push(toArrow(moveReview.bestUci.slice(0, 2), moveReview.bestUci.slice(2, 4), 'rgba(129, 182, 76, 0.9)'));
    }
    return out;
  }, [hoverUci, threat, settings.showBestArrow, moveReview, ply]);

  const checkSquare = useMemo(() => {
    const c = new Chess(fen);
    if (!c.inCheck()) return null;
    return c.findPiece({ type: 'k', color: c.turn() })[0] ?? null;
  }, [fen]);

  const material = useMemo(() => materialInfo(fen), [fen]);
  const clockFor = (color: 'w' | 'b') => {
    for (let i = nav.current; i >= 0; i--) if (plies[i].color === color) return plies[i].clock;
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
      clock={hasClocks && !isVar ? clockFor(color) : undefined}
      toMove={toMove === color}
      accuracy={color === 'w' ? review?.white.accuracy : review?.black.accuracy}
    />
  );
  const topColor = orientation === 'white' ? 'b' : 'w';
  const bottomColor = orientation === 'white' ? 'w' : 'b';

  /* ── Coach ────────────────────────────────────────────────────────── */

  const analyzing = status === 'analyzing';
  const opening = review?.opening?.name ?? game.opening;

  const coach: CoachMessage = (() => {
    if (mode === 'summary') return summaryMessage(game, review, analyzing, progress);
    if (retry) {
      const target = plies[retry.index];
      const c = review?.moves[retry.index]?.classification;
      const who = perspective === target.color ? 'you' : target.color === 'w' ? 'White' : 'Black';
      if (!retryAttempt) {
        return {
          icon: c,
          tag: 'Retry',
          headline: 'Find a better move',
          details: [
            retry.note === 'same'
              ? "That's the move played in the game. Try something else."
              : `${target.san} was ${c ? `${article(c)} ${CLASSIFICATION_LABEL[c].toLowerCase()}` : 'not best'}. Find a better move${who === 'you' ? '' : ` for ${who}`}.`,
          ],
        };
      }
      if (retryVerdict === 'checking') return { tag: 'Retry', san: retryAttempt.san, headline: `${retryAttempt.san}…`, loading: true };
      if (retryVerdict === 'correct') {
        return {
          tag: 'Retry',
          tone: 'success',
          icon: attemptReview?.classification ?? 'best',
          san: retryAttempt.san,
          headline: `${retryAttempt.san} is correct!`,
          details: attemptReview?.explanation.details.slice(0, 2) ?? ['That keeps the position.'],
        };
      }
      return {
        tag: 'Retry',
        tone: 'error',
        icon: attemptReview?.classification ?? 'mistake',
        san: retryAttempt.san,
        headline: `${retryAttempt.san} isn't it`,
        details: [attemptReview?.explanation.details[0] ?? '', 'Try again.'].filter(Boolean),
      };
    }
    if (!ply) {
      return {
        headline: 'Starting position',
        details: [
          ...(opening ? [opening] : []),
          'Step through with Next, or move the pieces to try your own ideas.',
        ],
        evaluation,
      };
    }
    if (!moveReview) {
      return { tag: isVar ? 'Analysis' : undefined, san: ply.san, headline: ply.san, loading: true, evaluation };
    }
    return {
      tag: isVar ? 'Analysis' : undefined,
      icon: moveReview.classification,
      san: ply.san,
      headline: moveReview.explanation.headline,
      details: moveReview.explanation.details,
      evaluation,
    };
  })();

  /* ── Action bar ───────────────────────────────────────────────────── */

  // Like Chess.com, only your own mistakes can be retried (any side's for pasted PGNs).
  const retryable =
    !isVar &&
    !!moveReview &&
    ERRORS.has(moveReview.classification) &&
    nav.current >= 0 &&
    (!perspective || plies[nav.current].color === perspective);
  /** While retrying, the board must not hint at the answer. */
  const hideHints = !!retry;
  const canBest = !!ply && !!moveReview?.bestLine.length && moveReview.bestUci !== ply.uci;
  const canShow = !!analysis?.lines[0]?.pv.length;

  let actions: Action[];
  let primary: PrimaryAction;
  if (mode === 'summary') {
    actions = [];
    primary = { label: 'Start Review', onClick: () => goto(Math.max(0, nav.current)), icon: Play };
  } else if (retry) {
    const target = plies[retry.index];
    actions = [
      {
        key: 'hint',
        label: 'Best',
        icon: Star,
        onClick: () => {
          // Showing the answer ends the retry.
          setRetry(null);
          showBest(target, review?.moves[retry.index] ?? null);
        },
      },
      ...(retryAttempt ? [{ key: 'again', label: 'Again', icon: RotateCcw, onClick: () => dispatch({ type: 'backToGame' }) }] : []),
    ];
    primary =
      retryVerdict === 'correct'
        ? { label: 'Continue', onClick: () => goto(retry.index), icon: ChevronRight }
        : { label: 'Skip', onClick: () => goto(retry.index), tone: 'neutral' };
  } else if (isVar) {
    actions = [
      { key: 'undo', label: 'Undo', icon: Undo2, onClick: undo },
      { key: 'show', label: 'Show', icon: Eye, onClick: showFollowUp, disabled: !canShow },
      { key: 'best', label: 'Best', icon: Star, onClick: () => showBest(), disabled: !canBest },
    ];
    primary = { label: 'Back to game', onClick: backToGame, icon: RotateCcw };
  } else {
    actions = [
      ...(retryable ? [{ key: 'retry', label: 'Retry', icon: RotateCcw, onClick: startRetry }] : []),
      { key: 'show', label: 'Show', icon: Eye, onClick: showFollowUp, disabled: !canShow },
      { key: 'best', label: 'Best', icon: Star, onClick: () => showBest(), disabled: !canBest },
    ];
    primary = atEnd
      ? { label: 'Finish', onClick: () => setMode('summary'), icon: BarChart3 }
      : { label: 'Next', onClick: () => step(1) };
  }

  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(game.pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; nothing useful to do.
    }
  };

  const resultText = game.result === '1/2-1/2' ? '½–½' : game.result.replace('-', '–');
  const reviewMoves = review?.moves ?? [];
  const board = (
    <Board
      fen={fen}
      orientation={orientation}
      theme={settings.boardTheme}
      lastMove={ply ? { from: ply.from, to: ply.to } : null}
      classification={hideHints && !retryAttempt ? null : moveReview?.classification}
      arrows={hideHints ? [] : arrows}
      checkSquare={checkSquare}
      threatSquares={hideHints ? [] : threat?.targets.map((t) => t.square)}
      interactive
      onMove={playMove}
      motion={nav.motion}
      onIllegal={() => feedback('illegal', 'illegal')}
      className="rounded-none sm:rounded-md"
    />
  );
  const engineLines = (
    <EngineLines analysis={analysis} onHover={setHoverUci} onPlay={(uci) => playMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })} />
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-36 [--board-size:min(100vw,560px)] lg:px-4 lg:pb-10 lg:[--board-size:min(calc(100dvh_-_17rem),calc(100vw_-_33rem),780px)]">
      {/* Header: compact app-style bar on phones, game details on desktop */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-line/70 bg-bg/95 px-1 backdrop-blur lg:static lg:h-auto lg:gap-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-3">
        <button type="button" onClick={onBack} className="icon-btn lg:btn lg:btn-ghost lg:-ml-2 lg:w-auto lg:px-2" aria-label="Back to games">
          <ArrowLeft size={22} /> <span className="hidden lg:inline">Games</span>
        </button>
        <h1 className="flex-1 text-center text-[19px] font-extrabold lg:hidden">Game Review</h1>
        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="truncate text-[17px] font-bold">
            {game.white.name} <span className="font-normal text-muted">vs</span> {game.black.name}
            <span className="ml-2 font-mono text-[15px] text-muted">{resultText}</span>
          </p>
          <p className="truncate text-[13px] text-muted">
            {[opening, formatTimeControl(game.timeControl), game.termination].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center lg:hidden">
          <button
            type="button"
            className={cn('icon-btn', mode === 'summary' && 'text-fg')}
            aria-label="Game summary"
            onClick={() => setMode(mode === 'summary' ? 'review' : 'summary')}
          >
            <BarChart3 size={20} />
          </button>
          <button
            type="button"
            className={cn('icon-btn', settings.showEngineLines && 'text-accent')}
            aria-label="Toggle engine lines"
            aria-pressed={settings.showEngineLines}
            onClick={() => onSettingsChange({ ...settings, showEngineLines: !settings.showEngineLines })}
          >
            <Cpu size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Flip board" onClick={() => setFlipped((f) => !f)}>
            <Repeat2 size={20} />
          </button>
          <SettingsMenu settings={settings} onChange={onSettingsChange} placement="down" />
        </div>
        <div className="hidden items-center gap-1 lg:flex">
          <button type="button" className="btn btn-ghost px-2.5 text-[13px]" onClick={copyPgn}>
            <Copy size={15} /> {copied ? 'Copied' : 'PGN'}
          </button>
          {game.url && (
            <a href={game.url} target="_blank" rel="noreferrer" className="btn btn-ghost px-2.5 text-[13px]">
              <ExternalLink size={15} /> {game.source === 'lichess' ? 'Lichess' : game.source === 'chesscom' ? 'Chess.com' : 'Source'}
            </a>
          )}
        </div>
        {/* Overlays the header's bottom edge so it never shifts the board. */}
        {analyzing && (
          <div className="absolute inset-x-0 -bottom-px h-0.5 bg-surface-3 lg:hidden" aria-hidden>
            <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </header>

      {error && status === 'error' && (
        <div className="m-3 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm lg:mx-0">
          <span>{error}</span>
          {parsed && (
            <button type="button" className="btn btn-ghost" onClick={() => setRunId((r) => r + 1)}>
              <RefreshCw size={15} /> Retry
            </button>
          )}
        </div>
      )}

      {parsed && (
        <div className="lg:grid lg:grid-cols-[auto_minmax(360px,1fr)] lg:items-start lg:gap-4">
          {/* Board column (hidden on phones while showing the summary) */}
          <section className={cn('flex-col lg:flex', mode === 'summary' ? 'hidden' : 'flex')} aria-label="Board">
            {!isDesktop && (
              <div className="space-y-3 px-3 pt-3 pb-1">
                <HorizontalEvalBar evaluation={evaluation} />
                {/* Fixed height: changing commentary must not move the board. */}
                <CoachBubble message={coach} fixed className="h-[138px]" />
              </div>
            )}

            <div className="mx-auto px-3 lg:mx-0 lg:px-0 lg:pl-[1.75rem]">{strip(topColor)}</div>
            <div className="mx-auto flex gap-2 lg:mx-0">
              {isDesktop && (
                <div className="w-5 shrink-0" style={{ height: 'var(--board-size)' }}>
                  <EvalBar evaluation={evaluation} orientation={orientation} />
                </div>
              )}
              {board}
            </div>
            <div className="mx-auto px-3 lg:mx-0 lg:px-0 lg:pl-[1.75rem]">{strip(bottomColor)}</div>

            {!isDesktop && (
              <div>
                <MoveStrip
                  plies={plies}
                  moves={reviewMoves}
                  nav={nav}
                  reviewOf={explorer.reviewOf}
                  onSelectMain={goto}
                  onSelectVariation={gotoVariation}
                  onPrev={stepBack}
                  onNext={stepForward}
                  canPrev={!atStart}
                  canNext={!atEnd}
                />
                {settings.showEngineLines && <div className="border-y border-line">{engineLines}</div>}
              </div>
            )}

            {/* Desktop transport controls */}
            {isDesktop && (
              <div className="mt-1 flex items-center justify-between pl-[1.75rem]">
                <button type="button" className="icon-btn" aria-label="Flip board (F)" title="Flip board (F)" onClick={() => setFlipped((f) => !f)}>
                  <Repeat2 size={18} />
                </button>
                <div className="flex items-center gap-0.5">
                  <button type="button" className="icon-btn" aria-label="First move" disabled={atStart} onClick={() => goto(-1)}>
                    <ChevronFirst size={22} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Previous move" disabled={atStart} onClick={() => step(-1)}>
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={playing ? 'Pause' : 'Play'}
                    onClick={() => {
                      if (atEnd && !isVar) dispatch({ type: 'goto', index: -1 });
                      setMode('review');
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button type="button" className="icon-btn" aria-label="Next move" disabled={atEnd} onClick={() => step(1)}>
                    <ChevronRight size={24} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Last move" disabled={!isVar && nav.current >= last} onClick={() => goto(last)}>
                    <ChevronLast size={22} />
                  </button>
                </div>
                <SettingsMenu settings={settings} onChange={onSettingsChange} />
              </div>
            )}
          </section>

          {/* Phone summary */}
          {!isDesktop && mode === 'summary' && (
            <section className="space-y-4 px-3 pt-3" aria-label="Summary">
              <CoachBubble message={coach} />
              {review ? (
                <EvalGraph evals={review.evals} moves={review.moves} plies={plies} current={nav.current} onSelect={goto} height={80} />
              ) : (
                <div className="skeleton h-20" />
              )}
              <div className="card -mx-0 overflow-hidden">
                <SummaryPanel game={game} review={review} plies={plies} onSelect={goto} onStart={() => goto(0)} />
              </div>
            </section>
          )}

          {/* Desktop side panel */}
          {isDesktop && (
            <aside className="card flex flex-col overflow-hidden lg:h-[calc(var(--board-size)_+_8.25rem)]" aria-label="Review">
              <div className="flex items-center border-b border-line">
                {(['summary', 'review'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMode(t)}
                    className={cn('relative flex-1 py-3 text-sm font-semibold transition-colors', mode === t ? 'text-fg' : 'text-muted hover:text-fg')}
                  >
                    {t === 'summary' ? 'Summary' : 'Review'}
                    {mode === t && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded bg-accent" />}
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

              {mode === 'summary' ? (
                <div className="scroll-thin flex-1 overflow-y-auto">
                  <div className="px-4 pt-4">
                    <CoachBubble message={coach} />
                  </div>
                  <div className="px-4 pt-4">
                    {review ? (
                      <EvalGraph evals={review.evals} moves={review.moves} plies={plies} current={nav.current} onSelect={goto} height={88} />
                    ) : (
                      <div className="skeleton h-[88px]" />
                    )}
                  </div>
                  <SummaryPanel game={game} review={review} plies={plies} onSelect={goto} onStart={() => goto(Math.max(0, nav.current))} />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="px-3 pt-3 pb-2">
                    <CoachBubble message={coach} fixed className="h-[150px]" />
                  </div>
                  {review && (
                    <div className="px-4 pb-2">
                      <EvalGraph evals={review.evals} moves={review.moves} plies={plies} current={nav.current} onSelect={goto} height={44} />
                    </div>
                  )}
                  {settings.showEngineLines && <div className="border-t border-line">{engineLines}</div>}
                  <div className="min-h-0 flex-1 border-t border-line">
                    <MoveList
                      plies={plies}
                      moves={reviewMoves}
                      nav={nav}
                      reviewOf={explorer.reviewOf}
                      onSelect={goto}
                      onSelectVariation={gotoVariation}
                      onDiscardVariation={backToGame}
                    />
                  </div>
                  <div className="border-t border-line p-2">
                    <ActionBar actions={actions} primary={primary} />
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Phone bottom bar */}
      {parsed && !isDesktop && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <ActionBar actions={actions} primary={primary} />
        </div>
      )}
    </div>
  );
}
