import { describe, expect, it } from 'vitest';
import { gameFromPgn, parseGame } from '@/lib/games/pgn';
import { formatTimeControl, resultFor, timeClassFromSeconds } from '@/lib/games/types';

const PGN = `[Event "Live Chess"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[WhiteElo "1500"]
[BlackElo "1550"]
[TimeControl "180+2"]

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:02:59.5]} 2. Qh5 {[%clk 0:02:58]} 2... Nc6 {[%clk 0:02:57]} 3. Bc4 {[%clk 0:02:55]} 3... Nf6 {[%clk 0:02:50]} 4. Qxf7# 1-0`;

describe('parseGame', () => {
  it('extracts plies, positions and clocks', () => {
    const g = parseGame(PGN);
    expect(g.plies).toHaveLength(7);
    expect(g.plies[0]).toMatchObject({ san: 'e4', uci: 'e2e4', color: 'w', moveNumber: 1, clock: 180 });
    expect(g.plies[1].clock).toBeCloseTo(179.5);
    expect(g.plies[6]).toMatchObject({ san: 'Qxf7#', moveNumber: 4, captured: 'p' });
    expect(g.plies[1].fenBefore).toBe(g.plies[0].fenAfter);
  });

  it('supports games from a custom position', () => {
    const g = parseGame('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 40"]\n\n40... Kd7 41. e4 *');
    expect(g.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 b - - 0 40');
    expect(g.plies.map((p) => p.color)).toEqual(['b', 'w']);
    expect(g.plies[0].moveNumber).toBe(40);
  });

  it('rejects garbage', () => {
    expect(() => parseGame('1. e4 e5 2. Kxe8')).toThrow(/PGN/);
  });
});

describe('gameFromPgn', () => {
  it('builds a record from headers', () => {
    const g = gameFromPgn(PGN);
    expect(g.white).toEqual({ name: 'alice', rating: 1500 });
    expect(g.timeClass).toBe('blitz');
    expect(g.id).toBe(gameFromPgn(PGN).id);
    expect(resultFor(g, 'w')).toBe('win');
    expect(resultFor(g, 'b')).toBe('loss');
  });
});

describe('time controls', () => {
  it('classifies and formats', () => {
    expect(timeClassFromSeconds(60, 0)).toBe('bullet');
    expect(timeClassFromSeconds(600, 0)).toBe('rapid');
    expect(formatTimeControl('180+2')).toBe('3 | 2');
    expect(formatTimeControl('600')).toBe('10 min');
    expect(formatTimeControl('1/86400')).toBe('1 day');
  });
});
