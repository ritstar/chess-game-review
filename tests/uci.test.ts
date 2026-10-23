import { describe, expect, it } from 'vitest';
import { MATE_CP, flipScore, formatScore, parseInfoLine, scoreToCp } from '@/lib/engine/uci';

describe('parseInfoLine', () => {
  it('parses a multipv line', () => {
    const line = parseInfoLine(
      'info depth 16 seldepth 22 multipv 2 score cp -31 nodes 4735 nps 225476 hashfull 1 time 21 pv e7e5 g1f3 b8c6',
    );
    expect(line).toEqual({ rank: 2, depth: 16, score: { cp: -31 }, pv: ['e7e5', 'g1f3', 'b8c6'] });
  });

  it('parses mate scores and promotions', () => {
    expect(parseInfoLine('info depth 5 multipv 1 score mate -2 pv a7a8q b8a8')?.score).toEqual({ mate: -2 });
    expect(parseInfoLine('info depth 5 multipv 1 score mate 1 pv a7a8q')?.pv).toEqual(['a7a8q']);
  });

  it('ignores bound scores and lines without a pv', () => {
    expect(parseInfoLine('info depth 10 score cp 20 lowerbound pv e2e4')).toBeNull();
    expect(parseInfoLine('info depth 10 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
  });
});

describe('scores', () => {
  it('orders mates above any centipawn score', () => {
    expect(scoreToCp({ mate: 3 })).toBeGreaterThan(scoreToCp({ mate: 5 }));
    expect(scoreToCp({ mate: 5 })).toBeGreaterThan(5000);
    expect(scoreToCp({ mate: -1 })).toBeLessThan(scoreToCp({ mate: -4 }));
    expect(scoreToCp({ mate: 0 })).toBe(-MATE_CP);
  });

  it('flips and formats', () => {
    expect(flipScore({ cp: 35 })).toEqual({ cp: -35 });
    expect(flipScore({ mate: 2 })).toEqual({ mate: -2 });
    expect(formatScore({ cp: 125 })).toBe('+1.25');
    expect(formatScore({ cp: -40 })).toBe('-0.40');
    expect(formatScore({ cp: 0 })).toBe('0.00');
    expect(formatScore({ mate: -3 })).toBe('-M3');
  });
});
