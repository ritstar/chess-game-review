'use client';

import { Search, Upload, X } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

export type LoaderSource = 'chesscom' | 'lichess' | 'pgn';

export interface RecentSearch {
  source: 'chesscom' | 'lichess';
  username: string;
}

interface GameLoaderProps {
  source: LoaderSource;
  onSourceChange: (s: LoaderSource) => void;
  username: string;
  onUsernameChange: (u: string) => void;
  onSearch: (username: string) => void;
  pgn: string;
  onPgnChange: (text: string) => void;
  onPgn: (text: string) => void;
  loading: boolean;
  recent: RecentSearch[];
  onRemoveRecent: (r: RecentSearch) => void;
  /** Showing someone's games: shrink to a one-line bar with a "Change" button. */
  collapsed?: { username: string; source: 'chesscom' | 'lichess'; onExpand: () => void };
}

const TABS: { id: LoaderSource; label: string }[] = [
  { id: 'chesscom', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
  { id: 'pgn', label: 'PGN / link' },
];

export function GameLoader(props: GameLoaderProps) {
  const { source, onSourceChange, username, onUsernameChange, onSearch, pgn, onPgnChange, onPgn, loading, recent } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const recentHere = recent.filter((r) => r.source === source);

  if (props.collapsed) {
    const c = props.collapsed;
    return (
      <div className="card flex items-center gap-3 px-3.5 py-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[15px] font-bold" aria-hidden>
          {c.username.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-semibold">{c.username}</span>
          <span className="block text-[12px] text-muted">{c.source === 'chesscom' ? 'Chess.com' : 'Lichess'}</span>
        </span>
        <button type="button" className="btn btn-ghost border border-line px-3 py-2 text-[13px]" onClick={c.onExpand}>
          <Search size={15} /> Change
        </button>
      </div>
    );
  }

  return (
    <div className="card p-2 shadow-[0_10px_40px_rgba(0,0,0,.25)]">
      <div className="flex gap-1 rounded-lg bg-bg/60 p-1" role="tablist" aria-label="Game source">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={source === t.id}
            onClick={() => onSourceChange(t.id)}
            className={cn(
              'flex-1 rounded-md py-2 text-sm font-semibold transition-colors',
              source === t.id ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {source === 'pgn' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pgn.trim()) onPgn(pgn);
            }}
            className="space-y-3"
          >
            <textarea
              value={pgn}
              onChange={(e) => onPgnChange(e.target.value)}
              placeholder={'Paste a PGN or a Lichess game link…\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …'}
              rows={6}
              spellCheck={false}
              className="input scroll-thin w-full resize-y font-mono text-[16px] sm:text-[13px]"
              aria-label="PGN or game link"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1" disabled={!pgn.trim() || loading}>
                {loading ? 'Loading…' : 'Review game'}
              </button>
              <button type="button" className="btn btn-ghost border border-line" onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> Upload .pgn
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pgn,text/plain,application/x-chess-pgn"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) onPgn(await file.text());
                  e.target.value = '';
                }}
              />
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (username.trim()) onSearch(username.trim());
            }}
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
                <input
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  placeholder={source === 'chesscom' ? 'Chess.com username' : 'Lichess username'}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Username"
                  className="input w-full pl-10"
                />
              </div>
              <button type="submit" className="btn btn-primary px-5" disabled={!username.trim() || loading}>
                {loading ? 'Loading…' : 'Find games'}
              </button>
            </div>
            {recentHere.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-subtle">Recent:</span>
                {recentHere.map((r) => (
                  <span key={r.username} className="chip pr-1">
                    <button type="button" onClick={() => onSearch(r.username)} className="hover:text-fg">
                      {r.username}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${r.username}`}
                      className="rounded-full p-0.5 hover:bg-surface-3"
                      onClick={() => props.onRemoveRecent(r)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
