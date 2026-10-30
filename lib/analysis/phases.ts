import { Chess } from 'chess.js';
import type { PlyRecord } from '@/lib/games/pgn';
import type { Classification, MoveReview } from './types';

export type Phase = 'opening' | 'middlegame' | 'endgame';

export interface PhaseGrade {
  phase: Phase;
  /** First and last ply index of the phase (inclusive). */
  from: number;
  to: number;
  /** A rating icon per player for how well they played this phase; null if they had no moves in it. */
  white: Classification | null;
  black: Classification | null;
}

/** Knights, bishops, rooks and queens on the board, both sides. */
function majorsAndMinors(chess: Chess): number {
  let n = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') n++;
  return n;
}

/** Either side has moved most of its pieces off the back rank. */
function backRankSparse(chess: Chess): boolean {
  const board = chess.board();
  const count = (row: number, color: 'w' | 'b') => board[row].filter((p) => p?.color === color).length;
  return count(7, 'w') < 4 || count(0, 'b') < 4;
}

/**
 * Split a game into opening, middlegame and endgame, following the rules
 * Lichess uses: the middlegame starts once pieces have been traded or
 * developed off the back rank (never before theory ends), the endgame once
 * six or fewer pieces besides kings and pawns remain.
 */
export function divideGame(plies: PlyRecord[], book: boolean[]): { middle: number | null; end: number | null } {
  let middle: number | null = null;
  let end: number | null = null;
  const lastBook = book.lastIndexOf(true);
  for (let i = 0; i < plies.length; i++) {
    const chess = new Chess(plies[i].fenAfter);
    const pieces = majorsAndMinors(chess);
    if (middle === null && i > lastBook && (pieces <= 10 || backRankSparse(chess) || i >= 30)) middle = i;
    if (pieces <= 6) {
      end = i;
      middle ??= i;
      break;
    }
  }
  return { middle, end };
}

/** Average move accuracy → the icon Chess.com-style phase grades use. */
export function gradeFor(accuracy: number): Classification {
  if (accuracy >= 96) return 'best';
  if (accuracy >= 89) return 'excellent';
  if (accuracy >= 80) return 'good';
  if (accuracy >= 68) return 'inaccuracy';
  if (accuracy >= 55) return 'mistake';
  return 'blunder';
}

export function phaseGrades(plies: PlyRecord[], moves: (MoveReview | null)[], book: boolean[]): PhaseGrade[] {
  const { middle, end } = divideGame(plies, book);
  const last = plies.length - 1;
  const ranges: { phase: Phase; from: number; to: number }[] = [];
  const openingEnd = (middle ?? end ?? last + 1) - 1;
  ranges.push({ phase: 'opening', from: 0, to: openingEnd });
  if (middle !== null) ranges.push({ phase: 'middlegame', from: middle, to: (end ?? last + 1) - 1 });
  if (end !== null) ranges.push({ phase: 'endgame', from: end, to: last });

  const grade = (from: number, to: number, color: 'w' | 'b'): Classification | null => {
    const own = moves.slice(from, to + 1).filter((m, k): m is MoveReview => !!m && plies[from + k].color === color);
    if (!own.length) return null;
    if (own.every((m) => m.classification === 'book' || m.classification === 'forced')) return 'book';
    const graded = own.filter((m) => m.classification !== 'book' && m.classification !== 'forced');
    const mean = graded.reduce((a, m) => a + m.accuracy, 0) / graded.length;
    // A brilliant find lifts the phase; a blunder caps it.
    if (graded.some((m) => m.classification === 'brilliant') && mean >= 85) return 'brilliant';
    const g = gradeFor(mean);
    if (graded.some((m) => m.classification === 'blunder') && ['best', 'excellent', 'good'].includes(g)) return 'inaccuracy';
    return g;
  };

  return ranges
    .filter((r) => r.to >= r.from)
    .map((r) => ({ ...r, white: grade(r.from, r.to, 'w'), black: grade(r.from, r.to, 'b') }));
}
