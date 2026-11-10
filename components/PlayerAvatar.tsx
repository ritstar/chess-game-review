'use client';

import { useState } from 'react';
import { usePlayerProfile } from '@/hooks/usePlayerProfile';
import type { GameSource } from '@/lib/games/types';
import { cn } from '@/lib/utils';

/**
 * A player's picture: their Chess.com avatar when they have one, otherwise
 * their initial on a tile in the colour of their pieces.
 */
export function PlayerAvatar({
  source,
  name,
  color,
  className,
}: {
  source: GameSource;
  name: string;
  color: 'w' | 'b';
  className?: string;
}) {
  const profile = usePlayerProfile(source, name);
  const [failed, setFailed] = useState<string | null>(null);
  const src = profile?.avatar && failed !== profile.avatar ? profile.avatar : null;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md font-bold',
        color === 'w' ? 'bg-[#f2f2f2] text-[#2a2825]' : 'bg-[#3e3b37] text-[#f2f2f2] ring-1 ring-white/10',
        className,
      )}
      aria-hidden
    >
      {src ? (
        // Tiny remote avatars: next/image's optimiser isn't worth routing them through.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** "GM", "IM"… in Chess.com's red title chip. */
export function PlayerTitle({ source, name, className }: { source: GameSource; name: string; className?: string }) {
  const title = usePlayerProfile(source, name)?.title;
  if (!title) return null;
  return <span className={cn('shrink-0 rounded-[3px] bg-[#7c2929] px-1 text-[0.72em] leading-[1.45] font-bold text-white', className)}>{title}</span>;
}
