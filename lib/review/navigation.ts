import type { PlyRecord } from '@/lib/games/pgn';

/**
 * Where the board is during a review: a position in the game (the mainline)
 * or a position in the line the user is exploring (the variation).
 *
 * Only one variation exists at a time. It branches after mainline ply `base`
 * (-1 = from the start position). `cursor` is how many of its moves are
 * shown; 0 means we're on the mainline.
 */
export interface NavState {
  /** Mainline ply index; -1 = start position. */
  current: number;
  variation: { base: number; moves: PlyRecord[] } | null;
  cursor: number;
  /** Pieces to slide on the board for the last step, if it was a single move. */
  motion?: Motion | null;
}

export interface Motion {
  /** Changes for every new step so the slide restarts. */
  key: string;
  /** Each piece now on `to` slides in from `from`. */
  slides: { from: string; to: string }[];
}

export type NavAction =
  | { type: 'goto'; index: number }
  | { type: 'gotoVariation'; cursor: number }
  | { type: 'step'; delta: 1 | -1 }
  /** `animate: false` for drag-and-drop, where the piece is already in place. */
  | { type: 'play'; ply: PlyRecord; animate?: boolean }
  | { type: 'setLine'; base: number; moves: PlyRecord[]; cursor: number }
  | { type: 'undo' }
  | { type: 'backToGame' };

export const initialNav: NavState = { current: -1, variation: null, cursor: 0, motion: null };

export function inVariation(s: NavState): boolean {
  return s.cursor > 0 && !!s.variation;
}

/** The move that led to the position on the board, if any. */
export function shownPly(s: NavState, mainline: PlyRecord[]): PlyRecord | null {
  if (inVariation(s)) return s.variation!.moves[s.cursor - 1];
  return s.current >= 0 ? (mainline[s.current] ?? null) : null;
}

/** The squares a ply moves pieces between (two pieces when castling). */
function slidesFor(ply: PlyRecord, direction: 1 | -1): Motion['slides'] {
  const pairs = [{ from: ply.from, to: ply.to }];
  if (ply.san.startsWith('O-O')) {
    const rank = ply.color === 'w' ? '1' : '8';
    pairs.push(ply.san.startsWith('O-O-O') ? { from: `a${rank}`, to: `d${rank}` } : { from: `h${rank}`, to: `f${rank}` });
  }
  return direction === 1 ? pairs : pairs.map(({ from, to }) => ({ from: to, to: from }));
}

/**
 * Board animation for going from one state to the next: slide forward when
 * the new position is one move after the old, backward when one move
 * before, and nothing for jumps.
 */
function motionBetween(prev: NavState, next: NavState, mainline: PlyRecord[], startFen: string): Motion | null {
  const before = shownPly(prev, mainline);
  const after = shownPly(next, mainline);
  const fenOf = (p: PlyRecord | null) => p?.fenAfter ?? startFen;
  if (after && after.fenBefore === fenOf(before)) return { key: `f:${after.fenAfter}`, slides: slidesFor(after, 1) };
  if (before && before.fenBefore === fenOf(after)) return { key: `b:${before.fenAfter}`, slides: slidesFor(before, -1) };
  return null;
}

export function navReducer(mainline: PlyRecord[], startFen: string) {
  const reduce = baseReducer(mainline);
  return (s: NavState, a: NavAction): NavState => {
    const next = reduce(s, a);
    if (next === s) return s;
    const animate = a.type !== 'play' || a.animate !== false;
    return { ...next, motion: animate ? motionBetween(s, next, mainline, startFen) : null };
  };
}

function baseReducer(mainline: PlyRecord[]) {
  const last = mainline.length - 1;
  const clamp = (i: number) => Math.max(-1, Math.min(last, i));

  return (s: NavState, a: NavAction): NavState => {
    switch (a.type) {
      case 'goto':
        return { ...s, current: clamp(a.index), cursor: 0 };

      case 'gotoVariation':
        if (!s.variation) return s;
        if (a.cursor <= 0) return { ...s, current: s.variation.base, cursor: 0 };
        return { ...s, current: s.variation.base, cursor: Math.min(a.cursor, s.variation.moves.length) };

      case 'step':
        if (inVariation(s)) {
          const cursor = Math.max(0, Math.min(s.variation!.moves.length, s.cursor + a.delta));
          return { ...s, cursor, current: s.variation!.base };
        }
        return { ...s, current: clamp(s.current + a.delta) };

      case 'play': {
        if (inVariation(s)) {
          const v = s.variation!;
          // Replaying the line's next move just steps along it.
          if (v.moves[s.cursor]?.uci === a.ply.uci) return { ...s, cursor: s.cursor + 1 };
          return { ...s, variation: { base: v.base, moves: [...v.moves.slice(0, s.cursor), a.ply] }, cursor: s.cursor + 1 };
        }
        // The move actually played in the game: stay on the mainline.
        if (mainline[s.current + 1]?.uci === a.ply.uci) return { ...s, current: s.current + 1 };
        // Re-entering the existing variation from its branch point keeps its continuation.
        if (s.variation?.base === s.current && s.variation.moves[0]?.uci === a.ply.uci) return { ...s, cursor: 1 };
        return { ...s, variation: { base: s.current, moves: [a.ply] }, cursor: 1 };
      }

      case 'setLine':
        if (a.moves.length === 0) return { ...s, current: clamp(a.base), cursor: 0 };
        return {
          current: clamp(a.base),
          variation: { base: clamp(a.base), moves: a.moves },
          cursor: Math.max(0, Math.min(a.moves.length, a.cursor)),
        };

      case 'undo': {
        if (!inVariation(s)) return s;
        const v = s.variation!;
        const moves = v.moves.slice(0, s.cursor - 1);
        if (moves.length === 0) return { current: v.base, variation: null, cursor: 0 };
        return { current: v.base, variation: { base: v.base, moves }, cursor: moves.length };
      }

      case 'backToGame':
        return { current: inVariation(s) ? s.variation!.base : s.current, variation: null, cursor: 0 };
    }
  };
}
