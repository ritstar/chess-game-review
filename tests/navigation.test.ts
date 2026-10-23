import { describe, expect, it } from 'vitest';
import { makePly, parseGame } from '@/lib/games/pgn';
import { inVariation, initialNav, navReducer, shownPly, type NavState } from '@/lib/review/navigation';

const { plies, startFen } = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
const reduce = navReducer(plies, startFen);
const run = (state: NavState, ...actions: Parameters<typeof reduce>[1][]) => actions.reduce(reduce, state);

describe('navigation', () => {
  it('steps along the game', () => {
    const s = run(initialNav, { type: 'step', delta: 1 }, { type: 'step', delta: 1 });
    expect(shownPly(s, plies)?.san).toBe('e5');
    expect(run(s, { type: 'goto', index: 99 }).current).toBe(plies.length - 1);
    expect(run(s, { type: 'goto', index: -5 }).current).toBe(-1);
  });

  it('playing the game move stays on the mainline', () => {
    const at = run(initialNav, { type: 'goto', index: 1 }); // after 1... e5
    const s = reduce(at, { type: 'play', ply: makePly(plies[1].fenAfter, 'Nf3')! });
    expect(inVariation(s)).toBe(false);
    expect(s.current).toBe(2);
  });

  it('a different move starts a variation and back-to-game returns to the branch point', () => {
    const at = run(initialNav, { type: 'goto', index: 1 });
    let s = reduce(at, { type: 'play', ply: makePly(plies[1].fenAfter, 'd4')! });
    s = reduce(s, { type: 'play', ply: makePly(s.variation!.moves[0].fenAfter, 'exd4')! });
    expect(inVariation(s)).toBe(true);
    expect(s.variation!.base).toBe(1);
    expect(s.variation!.moves.map((m) => m.san)).toEqual(['d4', 'exd4']);
    expect(shownPly(s, plies)?.san).toBe('exd4');

    const back = reduce(s, { type: 'backToGame' });
    expect(back).toMatchObject({ current: 1, variation: null, cursor: 0 });
  });

  it('stepping back out of a variation lands on the branch point', () => {
    const at = run(initialNav, { type: 'goto', index: 1 });
    let s = reduce(at, { type: 'play', ply: makePly(plies[1].fenAfter, 'd4')! });
    s = reduce(s, { type: 'step', delta: -1 });
    expect(inVariation(s)).toBe(false);
    expect(s.current).toBe(1);
    // The line is kept and can be re-entered by replaying its first move.
    s = reduce(s, { type: 'play', ply: makePly(plies[1].fenAfter, 'd4')! });
    expect(s.cursor).toBe(1);
  });

  it('playing a new move mid-line truncates the rest', () => {
    const at = run(initialNav, { type: 'goto', index: 1 });
    let s = reduce(at, { type: 'play', ply: makePly(plies[1].fenAfter, 'd4')! });
    s = reduce(s, { type: 'play', ply: makePly(s.variation!.moves[0].fenAfter, 'exd4')! });
    s = reduce(s, { type: 'step', delta: -1 });
    s = reduce(s, { type: 'play', ply: makePly(s.variation!.moves[0].fenAfter, 'd6')! });
    expect(s.variation!.moves.map((m) => m.san)).toEqual(['d4', 'd6']);
    expect(s.cursor).toBe(2);
  });

  it('undo removes the last tried move, then returns to the game', () => {
    const at = run(initialNav, { type: 'goto', index: 1 });
    let s = reduce(at, { type: 'play', ply: makePly(plies[1].fenAfter, 'd4')! });
    s = reduce(s, { type: 'play', ply: makePly(s.variation!.moves[0].fenAfter, 'exd4')! });
    s = reduce(s, { type: 'undo' });
    expect(s.variation!.moves.map((m) => m.san)).toEqual(['d4']);
    s = reduce(s, { type: 'undo' });
    expect(s).toMatchObject({ current: 1, variation: null, cursor: 0 });
  });
});

describe('board motion', () => {
  it('slides forward and backward one move, not on jumps', () => {
    const one = reduce(initialNav, { type: 'step', delta: 1 });
    expect(one.motion?.slides).toEqual([{ from: 'e2', to: 'e4' }]);
    const back = reduce(one, { type: 'step', delta: -1 });
    expect(back.motion?.slides).toEqual([{ from: 'e4', to: 'e2' }]);
    expect(reduce(initialNav, { type: 'goto', index: 4 }).motion).toBeNull();
  });

  it('moves the rook too when castling', () => {
    const { plies: castle, startFen: start } = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O');
    const r = navReducer(castle, start);
    const s = r({ ...initialNav, current: 5 }, { type: 'step', delta: 1 });
    expect(s.motion?.slides).toEqual([
      { from: 'e1', to: 'g1' },
      { from: 'h1', to: 'f1' },
    ]);
  });

  it('does not animate drag-and-drop moves', () => {
    const s = reduce(initialNav, { type: 'play', ply: makePly(startFen, 'd4')!, animate: false });
    expect(s.motion).toBeNull();
  });
});
