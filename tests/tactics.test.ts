import { describe, expect, it } from 'vitest';
import {
  detectFork,
  hangingPieces,
  materialBalance,
  materialSwing,
  sacrificedMaterial,
  staticExchange,
  uciLineToSan,
} from '@/lib/analysis/tactics';

describe('staticExchange', () => {
  it('wins an undefended piece', () => {
    // White to move; black knight on e5 undefended, attacked by the d4 pawn.
    expect(staticExchange('4k3/8/8/4n3/3P4/8/8/4K3 w - - 0 1', 'e5')).toBe(3);
  });

  it('does not take a defended piece with a more valuable one', () => {
    // Queen takes a pawn defended by a pawn: loses the queen, so SEE = 0.
    expect(staticExchange('4k3/8/3p4/4p3/8/8/4Q3/4K3 w - - 0 1', 'e5')).toBe(0);
  });
});

describe('hangingPieces', () => {
  it('finds a loose piece of the side not to move', () => {
    const hanging = hangingPieces('4k3/8/8/4n3/3P4/8/8/4K3 w - - 0 1', 'b');
    expect(hanging).toEqual([{ square: 'e5', piece: 'n', loss: 3 }]);
  });
});

describe('detectFork', () => {
  it('detects a knight fork of king and rook', () => {
    const fork = detectFork('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7');
    expect(fork?.targets.map((t) => t.piece).sort()).toEqual(['k', 'r']);
  });

  it('ignores a single attack', () => {
    expect(detectFork('4k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7')).toBeNull();
  });
});

describe('sacrificedMaterial', () => {
  it('detects a piece left en prise', () => {
    // Bxh7+ style: bishop lands on a square defended by the king.
    const before = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 0 1';
    const after = 'r1bq1rk1/pppp1ppB/2n2n2/2b1p3/4P3/3P1N2/PPP2PPP/RNBQ1RK1 b - - 0 1';
    expect(sacrificedMaterial(before, after, 'w')?.piece).toBe('b');
  });

  it('a plain developing move is not a sacrifice', () => {
    const before = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const after = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    expect(sacrificedMaterial(before, after, 'w')).toBeNull();
  });
});

describe('lines and material', () => {
  it('converts UCI to SAN and stops at illegal moves', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(uciLineToSan(start, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(uciLineToSan(start, ['e2e4', 'e2e4'])).toEqual(['e4']);
  });

  it('counts material and resolves exchanges', () => {
    expect(materialBalance('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBe(9);
    // White grabs a defended pawn with the queen; the line stops right after.
    const swing = materialSwing('4k3/8/3p4/4p3/8/8/4Q3/4K3 w - - 0 1', ['e2e5'], 'w');
    expect(swing).toBe(-8);
  });
});
