import { describe, expect, it } from 'vitest';
import { classifyMove, terminalEval, type ClassifyInput } from '@/lib/analysis/review';
import type { PositionAnalysis, Score } from '@/lib/engine/uci';
import { parseGame } from '@/lib/games/pgn';

/** Build engine output for a position: lines given as [firstMove, score]. */
function pos(fen: string, lines: [string, Score][]): PositionAnalysis {
  return { fen, depth: 16, lines: lines.map(([m, score], i) => ({ rank: i + 1, depth: 16, score, pv: [m] })) };
}

const game = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6');
const nf3 = game.plies[2]; // White's 2. Nf3

function input(bestScore: Score, playedAfter: Score, extra: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    ply: nf3,
    before: pos(nf3.fenBefore, [
      ['d2d4', bestScore],
      ['b1c3', { cp: (bestScore.cp ?? 0) - 10 }],
    ]),
    // Opponent to move after: their score is the negation of ours.
    after: pos(nf3.fenAfter, [['b8c6', playedAfter]]),
    isBook: false,
    ...extra,
  };
}

describe('classifyMove', () => {
  it('uses expected-points bands', () => {
    expect(classifyMove(input({ cp: 30 }, { cp: -25 })).classification).toBe('excellent');
    expect(classifyMove(input({ cp: 30 }, { cp: 0 })).classification).toBe('good');
    expect(classifyMove(input({ cp: 30 }, { cp: 60 })).classification).toBe('inaccuracy');
    expect(classifyMove(input({ cp: 30 }, { cp: 150 })).classification).toBe('mistake');
    expect(classifyMove(input({ cp: 30 }, { cp: 500 })).classification).toBe('blunder');
  });

  it('is lenient when the position stays completely winning', () => {
    // +9 → +6 loses ~6 win% but changes nothing about the result.
    expect(classifyMove(input({ cp: 900 }, { cp: -600 })).classification).toBe('good');
    // Throwing the win away is still a blunder.
    expect(classifyMove(input({ cp: 900 }, { cp: 100 })).classification).toBe('blunder');
  });

  it('marks the engine move as best', () => {
    const r = classifyMove({
      ...input({ cp: 30 }, { cp: -30 }),
      before: pos(nf3.fenBefore, [
        ['g1f3', { cp: 30 }],
        ['d2d4', { cp: 25 }],
      ]),
    });
    expect(r.classification).toBe('best');
    expect(r.winLoss).toBe(0);
  });

  it('marks the only good move as great', () => {
    const r = classifyMove({
      ...input({ cp: 30 }, { cp: -30 }),
      before: pos(nf3.fenBefore, [
        ['g1f3', { cp: 30 }],
        ['d2d4', { cp: -250 }],
      ]),
    });
    expect(r.classification).toBe('great');
  });

  it('book beats everything but forced', () => {
    expect(classifyMove(input({ cp: 30 }, { cp: 500 }, { isBook: true })).classification).toBe('book');
  });

  it('calls a failure to punish an error a miss', () => {
    const r = classifyMove(input({ cp: 400 }, { cp: -20 }, { prevClassification: 'blunder', prevMoverWin: 50 }));
    expect(r.classification).toBe('miss');
  });
});

describe('terminalEval', () => {
  it('scores checkmate for the winner', () => {
    const mated = parseGame('1. f3 e5 2. g4 Qh4#').plies[3].fenAfter;
    expect(terminalEval(mated)).toMatchObject({ terminal: 'checkmate', win: 0 });
  });

  it('returns null for live positions', () => {
    expect(terminalEval(nf3.fenAfter)).toBeNull();
  });
});
