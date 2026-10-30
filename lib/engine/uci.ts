/**
 * Pure helpers for the UCI protocol. Kept free of browser APIs so they can be
 * unit-tested in Node.
 */

/** Engine score from the point of view of the side to move. */
export interface Score {
  /** Centipawns. Present when the engine did not find a forced mate. */
  cp?: number;
  /** Moves to mate. Positive: side to move mates; negative: gets mated. 0: already mated. */
  mate?: number;
}

export interface EngineLine {
  /** 1-based MultiPV rank. */
  rank: number;
  depth: number;
  score: Score;
  /** Principal variation in UCI (long algebraic) notation. */
  pv: string[];
}

export interface PositionAnalysis {
  fen: string;
  depth: number;
  /** Lines sorted by rank. lines[0] is the engine's best move. */
  lines: EngineLine[];
  /**
   * The move actually played from this position, searched on its own
   * (`searchmoves`) to the same limits when it isn't one of `lines`. Lets the
   * played move be compared with the best one inside a single search instead
   * of across two different positions.
   */
  played?: EngineLine;
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Parse an `info` line. Returns null for lines without a score/pv (currmove
 * updates, string output) and for bound-only scores, which are not final.
 */
export function parseInfoLine(line: string): EngineLine | null {
  if (!line.startsWith('info ')) return null;
  if (/\b(upperbound|lowerbound)\b/.test(line)) return null;

  const tokens = line.split(/\s+/);
  let depth: number | undefined;
  let rank = 1;
  let score: Score | undefined;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') depth = Number(tokens[++i]);
    else if (t === 'multipv') rank = Number(tokens[++i]);
    else if (t === 'score') {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      score = kind === 'mate' ? { mate: value } : { cp: value };
    } else if (t === 'pv') {
      pv = tokens.slice(i + 1).filter((m) => UCI_MOVE.test(m));
      break;
    }
  }

  if (depth === undefined || !score || pv.length === 0) return null;
  return { rank, depth, score, pv };
}

/** Mate scores are mapped onto a large centipawn value so they can be compared. */
export const MATE_CP = 100_000;

export function scoreToCp(score: Score): number {
  if (typeof score.mate === 'number') {
    if (score.mate === 0) return -MATE_CP; // side to move is checkmated
    return Math.sign(score.mate) * (MATE_CP - Math.abs(score.mate) * 100);
  }
  return score.cp ?? 0;
}

/** Flip a score to the other side's point of view. */
export function flipScore(score: Score): Score {
  if (typeof score.mate === 'number') return { mate: -score.mate };
  return { cp: -(score.cp ?? 0) };
}

/** Human readable score, e.g. "+1.25", "-0.40", "M3", "-M2". */
export function formatScore(score: Score | undefined): string {
  if (!score) return '0.00';
  if (typeof score.mate === 'number') {
    if (score.mate === 0) return '#';
    return `${score.mate < 0 ? '-' : ''}M${Math.abs(score.mate)}`;
  }
  const cp = score.cp ?? 0;
  const v = (cp / 100).toFixed(2);
  return cp > 0 ? `+${v}` : v === '-0.00' ? '0.00' : v;
}
