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
}

export type NavAction =
  | { type: 'goto'; index: number }
  | { type: 'gotoVariation'; cursor: number }
  | { type: 'step'; delta: 1 | -1 }
  | { type: 'play'; ply: PlyRecord }
  | { type: 'setLine'; base: number; moves: PlyRecord[]; cursor: number }
  | { type: 'undo' }
  | { type: 'backToGame' };

export const initialNav: NavState = { current: -1, variation: null, cursor: 0 };

export function inVariation(s: NavState): boolean {
  return s.cursor > 0 && !!s.variation;
}

/** The move that led to the position on the board, if any. */
export function shownPly(s: NavState, mainline: PlyRecord[]): PlyRecord | null {
  if (inVariation(s)) return s.variation!.moves[s.cursor - 1];
  return s.current >= 0 ? (mainline[s.current] ?? null) : null;
}

export function navReducer(mainline: PlyRecord[]) {
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
