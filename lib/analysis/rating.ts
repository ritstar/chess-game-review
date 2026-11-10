import type { TimeClass } from '@/lib/games/types';

/**
 * "Game Rating": how strong the play in this one game was, on the rating
 * scale. Chess.com doesn't publish its formula, so this is our own estimate,
 * built the way theirs behaves: it starts from the player's actual rating and
 * moves up or down with how accurately they played compared with a typical
 * game at that rating and time control.
 *
 * Accuracy alone can't do this: in the games used to calibrate accuracy, club
 * players in daily games and grandmasters in 3-minute blitz both average in
 * the low 80s.
 */

/** Typical accuracy in blitz: about 68 at 1000, 76 at 2000, 86 at 3400. */
const BASE_ACCURACY = 60;
const ACCURACY_PER_1000 = 7.7;
/** More time, more accuracy. */
const TIME_CLASS_BONUS: Record<TimeClass, number> = {
  bullet: -3,
  blitz: 0,
  rapid: 3,
  classical: 5,
  daily: 8,
  unknown: 2,
};
/** Rating points per accuracy point above or below what's typical. */
const POINTS_PER_ACCURACY = 40;
const MAX_SWING = 600;

export function expectedAccuracy(rating: number, timeClass: TimeClass): number {
  return Math.min(95, BASE_ACCURACY + (ACCURACY_PER_1000 * rating) / 1000 + TIME_CLASS_BONUS[timeClass]);
}

/**
 * @param accuracy the player's accuracy in this game (0–100)
 * @param rating the player's rating, when known
 * @param moves how many moves the player made; very short games say little
 */
export function gameRating(
  accuracy: number | null | undefined,
  rating: number | undefined,
  timeClass: TimeClass,
  moves: number,
): number | null {
  if (accuracy == null || moves < 5) return null;
  let estimate: number;
  if (rating) {
    const swing = POINTS_PER_ACCURACY * (accuracy - expectedAccuracy(rating, timeClass));
    // A ten-move miniature shouldn't move the needle as far as a full game.
    const confidence = Math.min(1, moves / 20);
    estimate = rating + Math.max(-MAX_SWING, Math.min(MAX_SWING, swing * confidence));
  } else {
    // No rating to start from (a pasted PGN): the rating at which this accuracy is typical.
    estimate = ((accuracy - BASE_ACCURACY - TIME_CLASS_BONUS[timeClass]) / ACCURACY_PER_1000) * 1000;
    estimate = Math.min(3200, estimate);
  }
  return Math.max(100, Math.round(estimate / 50) * 50);
}
