import { describe, expect, it } from 'vitest';
import { expectedAccuracy, gameRating } from '@/lib/analysis/rating';
import { describeResult, type GameRecord } from '@/lib/games/types';

describe('gameRating', () => {
  it('equals the player rating for a typical game at that level', () => {
    expect(gameRating(expectedAccuracy(1500, 'blitz'), 1500, 'blitz', 40)).toBe(1500);
  });

  it('moves with accuracy, within limits', () => {
    const typical = expectedAccuracy(1200, 'rapid');
    expect(gameRating(typical + 8, 1200, 'rapid', 40)!).toBeGreaterThan(1400);
    expect(gameRating(typical - 8, 1200, 'rapid', 40)!).toBeLessThan(1000);
    expect(gameRating(100, 1200, 'rapid', 40)!).toBeLessThanOrEqual(1800);
  });

  it('expects more accuracy with more time', () => {
    expect(expectedAccuracy(1500, 'daily')).toBeGreaterThan(expectedAccuracy(1500, 'bullet'));
    // The same accuracy is worth less in a daily game than in bullet.
    expect(gameRating(80, 1500, 'daily', 40)!).toBeLessThan(gameRating(80, 1500, 'bullet', 40)!);
  });

  it('is cautious about short games and needs a few moves', () => {
    expect(gameRating(99, 1500, 'blitz', 3)).toBeNull();
    expect(gameRating(95, 1500, 'blitz', 8)!).toBeLessThan(gameRating(95, 1500, 'blitz', 40)!);
  });

  it('falls back to accuracy alone without a rating', () => {
    expect(gameRating(90, undefined, 'blitz', 40)!).toBeGreaterThan(gameRating(70, undefined, 'blitz', 40)!);
  });
});

describe('describeResult', () => {
  const game = (result: string, termination?: string) =>
    ({ result, termination, white: { name: 'Ann' }, black: { name: 'Bob' } }) as GameRecord;

  it('names the winner and how', () => {
    expect(describeResult(game('0-1', 'resigned'))).toBe('Bob won by resignation');
    expect(describeResult(game('1-0', 'mate'))).toBe('Ann won by checkmate');
    expect(describeResult(game('1/2-1/2', 'repetition'))).toBe('Draw by repetition');
  });

  it('keeps full sentences from PGN headers and skips unfinished games', () => {
    expect(describeResult(game('1-0', 'Ann won on time'))).toBe('Ann won on time');
    expect(describeResult(game('*'))).toBeNull();
  });
});
