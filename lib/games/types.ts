export type GameSource = 'chesscom' | 'lichess' | 'pgn';
export type Color = 'w' | 'b';
export type GameResult = 'win' | 'loss' | 'draw';
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'unknown';

export interface PlayerInfo {
  name: string;
  rating?: number;
}

/** A game from any source, normalised for display and analysis. */
export interface GameRecord {
  /** Stable id, unique across sources (used as the analysis cache key). */
  id: string;
  source: GameSource;
  url?: string;
  pgn: string;
  white: PlayerInfo;
  black: PlayerInfo;
  /** "1-0", "0-1", "1/2-1/2" or "*". */
  result: string;
  /** How the game ended, e.g. "checkmate", "resignation", "time". */
  termination?: string;
  endTime?: number;
  timeControl?: string;
  timeClass: TimeClass;
  rated?: boolean;
  opening?: string;
  /** The perspective to review from, when the game was loaded via a username. */
  perspective?: Color;
}

export function resultFor(game: GameRecord, color: Color): GameResult {
  if (game.result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (game.result === '0-1') return color === 'b' ? 'win' : 'loss';
  return 'draw';
}

export function timeClassFromSeconds(base: number, increment: number): TimeClass {
  // Lichess' definition: estimated duration = base + 40 * increment.
  const estimate = base + 40 * increment;
  if (estimate < 180) return 'bullet';
  if (estimate < 480) return 'blitz';
  if (estimate < 1500) return 'rapid';
  return 'classical';
}

/** Format "600+5" or "1/86400" style controls for display. */
export function formatTimeControl(tc?: string): string {
  if (!tc || tc === '-') return '';
  if (tc.includes('/')) {
    const days = Math.round(Number(tc.split('/')[1]) / 86400);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const [base, inc] = tc.split('+').map(Number);
  if (!Number.isFinite(base)) return tc;
  const minutes = base >= 60 ? `${+(base / 60).toFixed(1)}` : `${base}s`;
  return inc ? `${minutes} | ${inc}` : `${minutes} min`;
}
