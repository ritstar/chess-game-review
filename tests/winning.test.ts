import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy, winPercent } from '@/lib/analysis/winning';

describe('winPercent', () => {
  it('is 50 at equality and symmetric', () => {
    expect(winPercent(0)).toBe(50);
    expect(winPercent(200) + winPercent(-200)).toBeCloseTo(100);
    expect(winPercent(300)).toBeGreaterThan(70);
  });

  it('saturates for huge scores', () => {
    expect(winPercent(100000)).toBe(winPercent(1000));
  });
});

describe('accuracy', () => {
  it('perfect moves score 100', () => {
    expect(moveAccuracy(60, 60)).toBe(100);
    expect(moveAccuracy(60, 70)).toBe(100);
  });

  it('drops steeply with win% lost', () => {
    expect(moveAccuracy(60, 58)).toBeGreaterThan(80);
    expect(moveAccuracy(80, 20)).toBeLessThan(10);
  });

  it('scores each side of a game independently', () => {
    // White plays perfectly; Black throws the game on their only move.
    const cps = [0, 20, 1500];
    expect(gameAccuracy(cps, 'w')).toBeGreaterThan(95);
    expect(gameAccuracy(cps, 'b')).toBeLessThan(20);
  });
});
