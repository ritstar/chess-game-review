import type { GameSource } from './types';

/** Public profile details shown next to a player's name. */
export interface PlayerProfile {
  avatar?: string;
  /** Chess title, e.g. "GM". */
  title?: string;
}

const TTL_MS = 7 * 24 * 3600 * 1000;
const key = (source: GameSource, name: string) => `chess-review:profile:${source}:${name.toLowerCase()}`;
const pending = new Map<string, Promise<PlayerProfile | null>>();

function readCache(k: string): PlayerProfile | null | undefined {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return undefined;
    const { at, profile } = JSON.parse(raw) as { at: number; profile: PlayerProfile | null };
    return Date.now() - at < TTL_MS ? profile : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Avatar and title for a Chess.com player (their public API; Lichess has no
 * avatars). Cached for a week, fails soft: a missing profile just means the
 * initial is shown instead.
 */
export function fetchProfile(source: GameSource, name: string): Promise<PlayerProfile | null> {
  if (source !== 'chesscom' || !name || typeof localStorage === 'undefined') return Promise.resolve(null);
  const k = key(source, name);
  const cached = readCache(k);
  if (cached !== undefined) return Promise.resolve(cached);
  let request = pending.get(k);
  if (!request) {
    request = fetch(`https://api.chess.com/pub/player/${encodeURIComponent(name.toLowerCase())}`)
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { avatar?: string; title?: string };
        return { avatar: data.avatar, title: data.title } satisfies PlayerProfile;
      })
      .then((profile) => {
        try {
          localStorage.setItem(k, JSON.stringify({ at: Date.now(), profile }));
        } catch {
          // ignore
        }
        return profile;
      })
      // Network trouble or rate limiting: try again next time.
      .catch(() => null)
      .finally(() => pending.delete(k));
    pending.set(k, request);
  }
  return request;
}
