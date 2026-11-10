'use client';

import { useEffect, useState } from 'react';
import { fetchProfile, type PlayerProfile } from '@/lib/games/profiles';
import type { GameSource } from '@/lib/games/types';

/** Avatar and title for a player, once loaded (null until then, or when there is none). */
export function usePlayerProfile(source: GameSource, name: string): PlayerProfile | null {
  const id = `${source}:${name}`;
  const [loaded, setLoaded] = useState<{ id: string; profile: PlayerProfile | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchProfile(source, name).then((profile) => !cancelled && setLoaded({ id, profile }));
    return () => {
      cancelled = true;
    };
  }, [source, name, id]);
  return loaded?.id === id ? loaded.profile : null;
}
