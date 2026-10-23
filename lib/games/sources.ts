import type { GameRecord, TimeClass } from './types';

export class SourceError extends Error {}

export interface GamePage {
  games: GameRecord[];
  /** Opaque cursor for the next (older) page, or null when exhausted. */
  cursor: string | null;
}

const PAGE_SIZE = 40;

/* ── Chess.com ─────────────────────────────────────────────────────────── */

interface ChessComPlayer {
  username: string;
  rating: number;
  result: string;
}

interface ChessComGame {
  url: string;
  uuid: string;
  pgn?: string;
  time_control: string;
  time_class?: string;
  end_time: number;
  rated: boolean;
  rules: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
  eco?: string;
}

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

function chessComResult(g: ChessComGame): string {
  if (g.white.result === 'win') return '1-0';
  if (g.black.result === 'win') return '0-1';
  if (DRAW_RESULTS.has(g.white.result)) return '1/2-1/2';
  return '*';
}

function chessComOpening(g: ChessComGame): string | undefined {
  const slug = g.eco?.split('/openings/')[1];
  if (!slug) return undefined;
  // "Sicilian-Defense-Najdorf-Variation-6.Be3" → "Sicilian Defense Najdorf Variation"
  return decodeURIComponent(slug)
    .replace(/-\d+\..*$/, '')
    .replace(/-/g, ' ');
}

function normaliseChessCom(g: ChessComGame, username: string): GameRecord {
  const loser = g.white.result === 'win' ? g.black : g.white;
  return {
    id: `chesscom:${g.uuid}`,
    source: 'chesscom',
    url: g.url,
    pgn: g.pgn ?? '',
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    result: chessComResult(g),
    termination: loser.result,
    endTime: g.end_time * 1000,
    timeControl: g.time_control,
    timeClass: (['bullet', 'blitz', 'rapid', 'daily'].includes(g.time_class ?? '')
      ? g.time_class
      : 'unknown') as TimeClass,
    rated: g.rated,
    opening: chessComOpening(g),
    perspective: g.black.username.toLowerCase() === username.toLowerCase() ? 'b' : 'w',
  };
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new SourceError('Network error. Check your connection and try again.');
  }
  if (res.status === 404) throw new SourceError('Player not found.');
  if (res.status === 429) throw new SourceError('Rate limited by the server. Wait a minute and try again.');
  if (!res.ok) throw new SourceError(`Request failed (${res.status}).`);
  return res.json() as Promise<T>;
}

/**
 * Chess.com stores games in monthly archives. The cursor is the number of
 * archives (newest first) already consumed; pages are filled until at least
 * PAGE_SIZE games or archives run out.
 */
export async function fetchChessComGames(username: string, cursor: string | null): Promise<GamePage> {
  const user = username.trim().toLowerCase();
  const { archives = [] } = await getJson<{ archives?: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`,
  );
  const months = [...archives].reverse();
  let consumed = cursor ? Number(cursor) : 0;
  const games: GameRecord[] = [];

  while (consumed < months.length && games.length < PAGE_SIZE) {
    const { games: raw = [] } = await getJson<{ games?: ChessComGame[] }>(months[consumed]);
    consumed++;
    games.push(
      ...raw
        .filter((g) => g.rules === 'chess' && g.pgn)
        .sort((a, b) => b.end_time - a.end_time)
        .map((g) => normaliseChessCom(g, user)),
    );
  }

  return { games, cursor: consumed < months.length ? String(consumed) : null };
}

/* ── Lichess ───────────────────────────────────────────────────────────── */

interface LichessPlayer {
  user?: { name: string };
  aiLevel?: number;
  rating?: number;
}

interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: { white: LichessPlayer; black: LichessPlayer };
  winner?: 'white' | 'black';
  opening?: { eco: string; name: string };
  clock?: { initial: number; increment: number };
  pgn?: string;
}

const lichessName = (p: LichessPlayer) => p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous');

function normaliseLichess(g: LichessGame, username: string): GameRecord {
  const speed = g.speed === 'correspondence' ? 'daily' : g.speed === 'ultraBullet' ? 'bullet' : g.speed;
  const white = lichessName(g.players.white);
  const black = lichessName(g.players.black);
  return {
    id: `lichess:${g.id}`,
    source: 'lichess',
    url: `https://lichess.org/${g.id}`,
    pgn: g.pgn ?? '',
    white: { name: white, rating: g.players.white.rating },
    black: { name: black, rating: g.players.black.rating },
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : g.status === 'started' ? '*' : '1/2-1/2',
    termination: g.status,
    endTime: g.lastMoveAt,
    timeControl: g.clock ? `${g.clock.initial}+${g.clock.increment}` : undefined,
    timeClass: (['bullet', 'blitz', 'rapid', 'classical', 'daily'].includes(speed) ? speed : 'unknown') as TimeClass,
    rated: g.rated,
    opening: g.opening?.name,
    perspective: black.toLowerCase() === username.toLowerCase() ? 'b' : 'w',
  };
}

/** Lichess streams NDJSON newest first; the cursor is the `until` timestamp. */
export async function fetchLichessGames(username: string, cursor: string | null): Promise<GamePage> {
  const user = username.trim();
  const params = new URLSearchParams({
    max: String(PAGE_SIZE),
    pgnInJson: 'true',
    opening: 'true',
    clocks: 'true',
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
  });
  if (cursor) params.set('until', cursor);

  let res: Response;
  try {
    res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`, {
      headers: { Accept: 'application/x-ndjson' },
    });
  } catch {
    throw new SourceError('Network error. Check your connection and try again.');
  }
  if (res.status === 404) throw new SourceError('Player not found.');
  if (res.status === 429) throw new SourceError('Rate limited by Lichess. Wait a minute and try again.');
  if (!res.ok) throw new SourceError(`Request failed (${res.status}).`);

  const raw = (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LichessGame);
  const games = raw.filter((g) => g.variant === 'standard' && g.pgn).map((g) => normaliseLichess(g, user));
  const oldest = raw.at(-1)?.createdAt;
  return { games, cursor: raw.length === PAGE_SIZE && oldest ? String(oldest - 1) : null };
}

/** Fetch a single Lichess game from its URL or 8-char id. */
export async function fetchLichessGameByUrl(input: string): Promise<string | null> {
  const m = /lichess\.org\/(?:game\/export\/)?([a-zA-Z0-9]{8})/.exec(input.trim());
  if (!m) return null;
  const res = await fetch(`https://lichess.org/game/export/${m[1]}?clocks=true`);
  if (!res.ok) throw new SourceError('Could not load that Lichess game.');
  return res.text();
}

export function fetchGames(source: 'chesscom' | 'lichess', username: string, cursor: string | null) {
  return source === 'chesscom' ? fetchChessComGames(username, cursor) : fetchLichessGames(username, cursor);
}

