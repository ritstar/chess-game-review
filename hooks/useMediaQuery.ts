'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches. Used to render only the layout that's
 * on screen instead of hiding the other one with CSS (which would still pay
 * for rendering it on every move). Server render assumes it doesn't match.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
