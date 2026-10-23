import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Color, GameRecord } from './types';
import { timeClassFromSeconds } from './types';

export interface PlyRecord {
  /** 0-based index into the move list. */
  index: number;
  san: string;
  /** UCI notation, e.g. "e2e4", "e7e8q". */
  uci: string;
  color: Color;
  /** Full move number shown in notation (1. e4 e5 → both are move 1). */
  moveNumber: number;
  from: string;
  to: string;
  captured?: string;
  piece: string;
  fenBefore: string;
  fenAfter: string;
  /** Remaining clock after the move in seconds, from a [%clk] comment. */
  clock?: number;
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  plies: PlyRecord[];
}

function parseClock(comment?: string): number | undefined {
  const m = comment && /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(comment);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Parse a PGN into a list of plies with the positions before/after each move. */
export function parseGame(pgn: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
  } catch (err) {
    throw new Error(`Could not read this PGN: ${err instanceof Error ? err.message : String(err)}`);
  }

  const headers = Object.fromEntries(
    Object.entries(chess.getHeaders()).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  const startFen = headers.FEN && headers.SetUp !== '0' ? headers.FEN : DEFAULT_POSITION;
  const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));

  const history = chess.history({ verbose: true });
  const plies: PlyRecord[] = history.map((m, index) => ({
    index,
    san: m.san,
    uci: m.lan,
    color: m.color,
    moveNumber: Number(m.before.split(' ')[5]),
    from: m.from,
    to: m.to,
    captured: m.captured,
    piece: m.piece,
    fenBefore: m.before,
    fenAfter: m.after,
    clock: parseClock(comments.get(m.after)),
  }));

  return { headers, startFen, plies };
}

/** Build a GameRecord from a user-supplied PGN (paste or upload). */
export function gameFromPgn(pgn: string): GameRecord {
  const { headers, plies } = parseGame(pgn);
  if (plies.length === 0) throw new Error('This PGN has no moves to review.');

  const [base, inc] = (headers.TimeControl ?? '').split('+').map(Number);
  const rating = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const date = headers.UTCDate ?? headers.Date;
  const parsedDate = date ? Date.parse(date.replace(/\./g, '-')) : NaN;

  return {
    id: `pgn:${hash(pgn)}`,
    source: 'pgn',
    url: headers.Link || (headers.Site?.startsWith('http') ? headers.Site : undefined),
    pgn,
    white: { name: headers.White || 'White', rating: rating(headers.WhiteElo) },
    black: { name: headers.Black || 'Black', rating: rating(headers.BlackElo) },
    result: headers.Result ?? '*',
    termination: headers.Termination,
    endTime: Number.isNaN(parsedDate) ? undefined : parsedDate,
    timeControl: headers.TimeControl,
    timeClass: Number.isFinite(base) ? timeClassFromSeconds(base, inc || 0) : 'unknown',
    opening: headers.Opening,
  };
}

/** Small non-cryptographic hash (FNV-1a) for cache keys. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
