import { describe, expect, it } from 'vitest';
import { classifyMove, terminalEval, type ClassifyInput } from '@/lib/analysis/review';
import type { PositionAnalysis, Score } from '@/lib/engine/uci';
import { makePly, parseGame } from '@/lib/games/pgn';

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
  it('calls a sacrifice brilliant when winning if every other move gives the win away', () => {
    // Daniil_Kolbasenk0–Hikaru 2026: 40...Rxg3+! 41. Kxg3 Rc3+ wins the queen (+13.7);
    // the next-best move keeps "only" +3.3. Chess.com rates it brilliant.
    const fen = '2r4k/6p1/4Q2p/3p3P/3P2P1/1P3rBK/3q4/4R3 b - - 1 40';
    const ply = makePly(fen, 'Rxg3+', 79)!;
    const line = (pv: string[], cp: number) => ({ rank: 1, depth: 20, score: { cp }, pv });
    const before: PositionAnalysis = {
      fen,
      depth: 20,
      lines: [line(['f3g3', 'h3g3', 'c8c3', 'e1e3'], 1369), line(['c8f8', 'e6d6'], 326), line(['f3c3', 'e1e2'], 317)],
    };
    const after = pos(ply.fenAfter, [['h3g3', { cp: -1366 }]]);
    expect(classifyMove({ ply, before, after, isBook: false }).classification).toBe('brilliant');

    // The same sacrifice when a quieter move also keeps a crushing position is just best.
    const easy = { ...before, lines: [before.lines[0], line(['c8f8', 'e6d6'], 1200)] };
    expect(classifyMove({ ply, before: easy, after, isBook: false }).classification).toBe('best');
  });

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
