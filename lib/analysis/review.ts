import { Chess } from 'chess.js';
import type { PlyRecord } from '@/lib/games/pgn';
import { MATE_CP, flipScore, scoreToCp, type EngineLine, type PositionAnalysis, type Score } from '@/lib/engine/uci';
import { explainMove } from './explain';
import { lookupOpening, type OpeningBook } from './openings';
import { PIECE_VALUE, sacrificedMaterial, staticExchange, uciLineToSan } from './tactics';
import {
  CLASSIFICATIONS,
  type Classification,
  type EngineLineView,
  type EvalPoint,
  type GameReview,
  type MoveReview,
  type PlayerSummary,
} from './types';
import { gameAccuracy, moveAccuracy, winPercent } from './winning';

/* ── Thresholds ───────────────────────────────────────────────────────────
 * Expected-points loss (win% / 100) bands, matching Chess.com's published
 * Classification V2 model: the same 100cp drop is a blunder at +0.5 and
 * irrelevant at +9, which pure centipawn thresholds get wrong.
 */
const EXCELLENT = 2;
const GOOD = 5;
const INACCURACY = 10;
const MISTAKE = 20;

/** Win% beyond which the game is considered decided. */
const DECIDED_WIN = 90;

/** A "great" move: every alternative is at least a mistake. */
const GREAT_GAP = 10;
/** Brilliant sacrifices aren't awarded when already completely winning. */
const BRILLIANT_MAX_WIN_BEFORE = 97;
const BRILLIANT_MIN_WIN_AFTER = 50;

/* ── Evaluations ─────────────────────────────────────────────────────── */

const turnOf = (fen: string) => fen.split(' ')[1] as 'w' | 'b';

/** Positions where the game is over need no engine (and Stockfish returns no PV). */
export function terminalEval(fen: string): EvalPoint | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    const whiteMated = chess.turn() === 'w';
    return {
      cp: whiteMated ? -MATE_CP : MATE_CP,
      score: { mate: 0 },
      win: whiteMated ? 0 : 100,
      terminal: 'checkmate',
    };
  }
  if (chess.isStalemate()) return { cp: 0, score: { cp: 0 }, win: 50, terminal: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { cp: 0, score: { cp: 0 }, win: 50, terminal: 'draw' };
  return null;
}

/** Engine score (side-to-move POV) → White POV. */
export function toWhite(score: Score, fen: string): Score {
  return turnOf(fen) === 'w' ? score : flipScore(score);
}

const evalCache = new WeakMap<PositionAnalysis, EvalPoint | null>();

/**
 * White-POV evaluation of an analysed position. Cached per analysis object:
 * the review is rebuilt many times while results stream in, and the game-over
 * check behind it isn't free.
 */
export function evalPoint(analysis: PositionAnalysis): EvalPoint | null {
  if (evalCache.has(analysis)) return evalCache.get(analysis)!;
  const result = computeEvalPoint(analysis);
  evalCache.set(analysis, result);
  return result;
}

function computeEvalPoint(analysis: PositionAnalysis): EvalPoint | null {
  const terminal = terminalEval(analysis.fen);
  if (terminal) return terminal;
  const top = analysis.lines[0];
  if (!top) return null;
  const pov = scoreToCp(top.score);
  const cp = turnOf(analysis.fen) === 'w' ? pov : -pov;
  return { cp, score: toWhite(top.score, analysis.fen), win: winPercent(cp) };
}

export function lineView(analysis: PositionAnalysis, line: EngineLine, maxPlies = 12): EngineLineView {
  return {
    score: toWhite(line.score, analysis.fen),
    san: uciLineToSan(analysis.fen, line.pv, maxPlies),
    uci: line.pv,
    depth: line.depth,
  };
}

/* ── Classification ──────────────────────────────────────────────────── */

export interface ClassifyInput {
  ply: PlyRecord;
  before: PositionAnalysis;
  after: PositionAnalysis;
  /** The opponent's previous move, if any (for "miss" and recapture detection). */
  prevPly?: PlyRecord;
  prevClassification?: Classification;
  /** Mover's win% two plies ago (before the opponent's previous move). */
  prevMoverWin?: number;
  isBook: boolean;
}

export interface Classified {
  classification: Classification;
  bestCp: number;
  playedCp: number;
  winBest: number;
  winPlayed: number;
  winLoss: number;
  sacrifice: ReturnType<typeof sacrificedMaterial>;
}

/** Score of the played move from the mover's POV. */
function playedMoverCp(input: ClassifyInput): number {
  const { ply, before, after } = input;
  // Prefer the score from the same search as the best move when the played
  // move is one of the engine's candidate lines – it keeps comparisons
  // consistent and avoids "the best move lost 0.1" noise between searches.
  const same = before.lines.find((l) => l.pv[0] === ply.uci);
  if (same) return scoreToCp(same.score);
  const terminal = terminalEval(after.fen);
  if (terminal) return ply.color === 'w' ? terminal.cp : -terminal.cp;
  const top = after.lines[0];
  return top ? -scoreToCp(top.score) : scoreToCp(before.lines[0]?.score ?? { cp: 0 });
}

export function classifyMove(input: ClassifyInput): Classified {
  const { ply, before, isBook } = input;
  const best = before.lines[0];
  const bestCp = best ? scoreToCp(best.score) : 0;
  const playedCp = playedMoverCp(input);
  const winBest = winPercent(bestCp);
  const winPlayed = winPercent(playedCp);
  const winLoss = Math.max(0, winBest - winPlayed);
  const isTop = best?.pv[0] === ply.uci;
  const legalMoves = new Chess(ply.fenBefore).moves().length;

  const result = (classification: Classification, sacrifice: Classified['sacrifice'] = null): Classified => ({
    classification,
    bestCp,
    playedCp,
    winBest,
    winPlayed,
    winLoss,
    sacrifice,
  });

  if (legalMoves === 1) return result('forced');
  if (isBook) return result('book');
  if (ply.san.endsWith('#')) return result('best');

  // Brilliant: a sound piece sacrifice that is (near-)best and leaves the
  // mover at least equal, without already being completely winning.
  if (winLoss <= EXCELLENT && winBest < BRILLIANT_MAX_WIN_BEFORE && winPlayed >= BRILLIANT_MIN_WIN_AFTER) {
    const sacrifice = sacrificedMaterial(ply.fenBefore, ply.fenAfter, ply.color);
    if (sacrifice) return result('brilliant', sacrifice);
  }

  if (isTop) {
    const second = before.lines[1];
    if (second && isGreat(input, winBest, winPercent(scoreToCp(second.score)))) return result('great');
    return result('best');
  }

  let classification: Classification;
  if (winLoss <= EXCELLENT) classification = 'excellent';
  else if (winLoss <= GOOD) classification = 'good';
  else if (winLoss <= INACCURACY) classification = 'inaccuracy';
  else if (winLoss <= MISTAKE) classification = 'mistake';
  else classification = 'blunder';

  // When the outcome doesn't change – still decisively winning, or already
  // hopelessly lost – small slips matter less. Soften by one band.
  const decided = (winPlayed >= DECIDED_WIN && winBest >= DECIDED_WIN) || winBest <= 100 - DECIDED_WIN;
  if (decided) {
    if (classification === 'inaccuracy') classification = 'good';
    else if (classification === 'mistake') classification = 'inaccuracy';
  }

  // Miss: the opponent just erred and this move fails to cash in, but
  // doesn't make the position worse than it was before their error.
  if (
    (classification === 'mistake' || classification === 'blunder') &&
    (input.prevClassification === 'mistake' || input.prevClassification === 'blunder') &&
    input.prevMoverWin !== undefined &&
    winPlayed >= input.prevMoverWin - 5
  ) {
    classification = 'miss';
  }

  return result(classification);
}

function isGreat(input: ClassifyInput, winBest: number, winSecond: number): boolean {
  if (winBest - winSecond < GREAT_GAP) return false;
  const { ply, prevPly } = input;
  // Recapturing a piece is "only move" chess but hardly a great find.
  if (ply.captured && prevPly?.captured && prevPly.to === ply.to) return false;
  // Neither is grabbing a piece that was simply left en prise.
  if (ply.captured) {
    const gain = PIECE_VALUE[ply.captured as keyof typeof PIECE_VALUE] ?? 0;
    const recapture = staticExchange(ply.fenAfter, ply.to as never);
    if (gain - recapture >= 2) return false;
  }
  // Escaping check with the one non-losing move is routine.
  if (new Chess(ply.fenBefore).inCheck() && winBest < 90) return false;
  return true;
}

/* ── Whole-game review ───────────────────────────────────────────────── */

function emptyCounts(): Record<Classification, number> {
  return Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>;
}

/**
 * Which plies are opening theory. A move is book when the position it reaches
 * is in the book and the game hasn't left theory for good yet – move-order
 * transpositions back into known lines still count, but once two moves in a
 * row are out of book the opening phase is over.
 */
export function bookMoves(plies: PlyRecord[], book: OpeningBook): boolean[] {
  const result = plies.map(() => false);
  let misses = 0;
  for (let i = 0; i < plies.length && misses < 2; i++) {
    if (lookupOpening(book, plies[i].fenAfter)) {
      result[i] = true;
      misses = 0;
    } else misses++;
  }
  return result;
}

/** Deepest named opening reached by the game. */
export function detectOpening(plies: PlyRecord[], book: OpeningBook) {
  let opening: { eco: string; name: string } | undefined;
  for (const ply of plies.slice(0, 40)) {
    const hit = lookupOpening(book, ply.fenAfter);
    if (hit) opening = hit;
  }
  return opening;
}

export interface ReviewMoveInput {
  ply: PlyRecord;
  index: number;
  before: PositionAnalysis;
  after: PositionAnalysis;
  prevPly?: PlyRecord;
  prevClassification?: Classification;
  /** Evaluation before the opponent's previous move (for "miss"). */
  prevMoverEval?: EvalPoint | null;
  isBook: boolean;
  book: OpeningBook;
  perspective?: 'w' | 'b';
}

/**
 * Classify and explain one move from the analyses of the positions before
 * and after it. Shared by the game review and moves tried on the board.
 */
export function reviewMove(input: ReviewMoveInput): MoveReview {
  const { ply, before, after, book } = input;
  const evalBefore = evalPoint(before)!;
  const evalAfter = evalPoint(after)!;
  const moverWin = (e: EvalPoint) => (ply.color === 'w' ? e.win : 100 - e.win);
  const classified = classifyMove({
    ply,
    before,
    after,
    prevPly: input.prevPly,
    prevClassification: input.prevClassification,
    prevMoverWin: input.prevMoverEval ? moverWin(input.prevMoverEval) : undefined,
    isBook: input.isBook,
  });

  const best = before.lines[0];
  const bestLine = best ? uciLineToSan(before.fen, best.pv, 10) : [];
  const replyLine = after.lines[0] ? uciLineToSan(after.fen, after.lines[0].pv, 10) : [];

  return {
    index: input.index,
    classification: classified.classification,
    winLoss: classified.winLoss,
    cpLoss: Math.min(1000, Math.max(0, Math.min(classified.bestCp, 1000) - Math.min(classified.playedCp, 1000))),
    accuracy: moveAccuracy(moverWin(evalBefore), moverWin(evalAfter)),
    bestUci: best?.pv[0],
    bestSan: bestLine[0],
    bestLine,
    replyLine,
    explanation: explainMove({
      ply,
      classified,
      before,
      after,
      bestLine,
      replyLine,
      prevPly: input.prevPly,
      perspective: input.perspective,
      opening: classified.classification === 'book' ? lookupOpening(book, ply.fenAfter)?.name : undefined,
    }),
  };
}

/**
 * Build the review from whatever positions have been analysed so far. Safe to
 * call repeatedly while analysis streams in: moves are classified in game
 * order (each depends on the previous one), so only the contiguous analysed
 * prefix is reviewed. Pass the same `memo` between calls to avoid redoing
 * finished moves.
 */
export function buildReview(
  plies: PlyRecord[],
  positions: (PositionAnalysis | null)[],
  book: OpeningBook,
  memo: Map<number, MoveReview> = new Map(),
  perspective?: 'w' | 'b',
): GameReview {
  const evals = positions.map((p) => (p ? evalPoint(p) : null));
  const theory = bookMoves(plies, book);
  const moves: (MoveReview | null)[] = [];

  for (let i = 0; i < plies.length; i++) {
    const cached = memo.get(i);
    if (cached) {
      moves.push(cached);
      continue;
    }
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after || !evals[i] || !evals[i + 1]) {
      while (moves.length < plies.length) moves.push(null);
      break;
    }
    const prevMoverEval = i >= 1 ? evals[i - 1] : null;
    moves.push(
      reviewMove({
        ply: plies[i],
        index: i,
        before,
        after,
        prevPly: plies[i - 1],
        prevClassification: moves[i - 1]?.classification,
        prevMoverEval,
        isBook: theory[i],
        book,
        perspective,
      }),
    );
  }

  moves.forEach((m) => m && memo.set(m.index, m));
  const complete = positions.every(Boolean);
  const firstMover = plies[0]?.color ?? 'w';
  const summary = (color: 'w' | 'b'): PlayerSummary => {
    const own = moves.filter((m, i): m is MoveReview => !!m && plies[i].color === color);
    const counts = emptyCounts();
    own.forEach((m) => counts[m.classification]++);
    const wins = evals.map((e) => e?.win ?? NaN);
    return {
      accuracy: complete ? gameAccuracy(wins, color, firstMover) : null,
      acpl: own.length ? Math.round(own.reduce((a, m) => a + m.cpLoss, 0) / own.length) : 0,
      counts,
    };
  };

  return {
    positions,
    evals,
    moves,
    white: summary('w'),
    black: summary('b'),
    opening: detectOpening(plies, book),
    keyMoments: keyMoments(moves),
    complete,
  };
}

/** The biggest swings and best finds, in game order (at most 6). */
function keyMoments(moves: (MoveReview | null)[]): number[] {
  const notable = moves.filter(
    (m): m is MoveReview =>
      !!m && ['brilliant', 'great', 'miss', 'mistake', 'blunder'].includes(m.classification),
  );
  const score = (m: MoveReview) =>
    m.classification === 'brilliant' ? 100 : m.classification === 'great' ? 50 : m.winLoss;
  return notable
    .sort((a, b) => score(b) - score(a))
    .slice(0, 6)
    .map((m) => m.index)
    .sort((a, b) => a - b);
}
