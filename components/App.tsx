'use client';

import { Cpu, Github, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameList, GameListSkeleton } from '@/components/home/GameList';
import { GameLoader, type LoaderSource, type RecentSearch } from '@/components/home/GameLoader';
import { ReviewScreen } from '@/components/review/ReviewScreen';
import { prefetchEngine } from '@/lib/engine/stockfish';
import { gameFromPgn } from '@/lib/games/pgn';
import { SourceError, fetchGames, fetchLichessGameByUrl } from '@/lib/games/sources';
import type { GameRecord } from '@/lib/games/types';
import { cn } from '@/lib/utils';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { AUTHOR, AUTHOR_URL, REPO_URL } from '@/lib/site';

const RECENT_KEY = 'chess-review:recent';

function readRecent(): RecentSearch[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentSearch[];
  } catch {
    return [];
  }
}

function writeRecent(list: RecentSearch[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    // ignore
  }
}

/** Mirror the current search and game in the URL so it can be shared and survives reloads. */
function syncUrl(params: Record<string, string | undefined>, push = false) {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  if (url.href === window.location.href) return;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [source, setSource] = useState<LoaderSource>('chesscom');
  const [username, setUsername] = useState('');
  const [pgnText, setPgnText] = useState('');
  const [searched, setSearched] = useState<{ source: 'chesscom' | 'lichess'; username: string } | null>(null);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameRecord | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  /** Whether the search form is open while a player's games are listed. */
  const [editingSearch, setEditingSearch] = useState(false);
  const pendingGameId = useRef<string | null>(null);
  const requestId = useRef(0);

  const search = useCallback(async (src: 'chesscom' | 'lichess', name: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setGames([]);
    setCursor(null);
    setSearched({ source: src, username: name });
    setEditingSearch(false);
    try {
      const page = await fetchGames(src, name, null);
      if (id !== requestId.current) return;
      setGames(page.games);
      setCursor(page.cursor);
      if (page.games.length === 0) setError('No standard chess games found for this player.');

      const entry = { source: src, username: name };
      setRecent((prev) => {
        const next = [entry, ...prev.filter((r) => !(r.source === src && r.username.toLowerCase() === name.toLowerCase()))];
        writeRecent(next);
        return next.slice(0, 6);
      });

      const wanted = pendingGameId.current;
      pendingGameId.current = null;
      const match = wanted ? page.games.find((g) => g.id === wanted) : undefined;
      if (match) setGame(match);
      else syncUrl({ src, u: name });
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof SourceError ? err.message : 'Something went wrong loading games.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Restore settings, recent searches and any search/game from the URL.
  useEffect(() => {
    // localStorage only exists in the browser, so this can't be initial state
    // without a hydration mismatch on the prerendered page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setRecent(readRecent());
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src');
    const u = params.get('u');
    if ((src === 'chesscom' || src === 'lichess') && u) {
      setSource(src);
      setUsername(u);
      pendingGameId.current = params.get('g');
      void search(src, u);
      return;
    }
    // Most visits are "review my latest game": reopen the last player's games.
    const last = readRecent()[0];
    if (last) {
      setSource(last.source);
      setUsername(last.username);
      void search(last.source, last.username);
    }
  }, [search]);

  // Once games are listed a review is likely next: fetch the engine while idle.
  useEffect(() => {
    if (games.length === 0) return;
    const t = setTimeout(() => void prefetchEngine(), 1500);
    return () => clearTimeout(t);
  }, [games.length]);

  // Browser back from a review returns to the list.
  useEffect(() => {
    const onPop = () => {
      if (!new URLSearchParams(window.location.search).get('g')) setGame(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openGame = (g: GameRecord) => {
    setGame(g);
    window.scrollTo({ top: 0 });
    if (searched && g.source !== 'pgn') syncUrl({ src: searched.source, u: searched.username, g: g.id }, true);
  };

  const closeGame = () => {
    if (new URLSearchParams(window.location.search).get('g') && window.history.length > 1) window.history.back();
    else syncUrl(searched ? { src: searched.source, u: searched.username } : {});
    setGame(null);
  };

  const loadMore = async () => {
    if (!searched || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchGames(searched.source, searched.username, cursor);
      setGames((prev) => [...prev, ...page.games.filter((g) => !prev.some((p) => p.id === g.id))]);
      setCursor(page.cursor);
    } catch (err) {
      setError(err instanceof SourceError ? err.message : 'Could not load more games.');
    } finally {
      setLoadingMore(false);
    }
  };

  const loadPgn = async (text: string) => {
    setError(null);
    setLoading(true);
    try {
      const pgn = (await fetchLichessGameByUrl(text)) ?? text;
      openGame(gameFromPgn(pgn));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this PGN.');
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className={cn('sticky top-0 z-40 border-b border-line/70 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur', game && 'hidden lg:block')}
      >
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4">
          <button type="button" onClick={() => game && closeGame()} className="flex items-center gap-2.5" aria-label="Home">
            <Logo />
            <span className="text-[17px] font-extrabold tracking-tight">
              Game<span className="text-accent">Review</span>
            </span>
          </button>
          <span className="ml-auto hidden text-[12px] text-subtle sm:block">Stockfish 17 · runs in your browser</span>
        </div>
      </header>

      <main className="flex-1">
        {game ? (
          <ReviewScreen key={game.id} game={game} settings={settings} onSettingsChange={updateSettings} onBack={closeGame} />
        ) : (
          <div className={cn('mx-auto w-full max-w-3xl px-4 pb-16', searched ? 'pt-4 sm:pt-8' : 'pt-8 sm:pt-16')}>
            {/* The pitch is for first-time visitors; once games are showing, it gets out of the way. */}
            {!searched && (
              // Short on phones so the search box sits high enough to stay above the keyboard.
              <div className="mb-5 text-center sm:mb-8">
                <h1 className="text-[24px] leading-tight font-extrabold tracking-tight sm:text-[44px]">
                  Find out what really happened in your game.
                </h1>
                <p className="mx-auto mt-3 hidden max-w-xl text-[16px] text-muted sm:block">
                  Free move-by-move review of your Chess.com and Lichess games: brilliant moves, blunders, accuracy
                  and the reasons behind them.
                </p>
              </div>
            )}

            <GameLoader
              source={source}
              onSourceChange={(s) => {
                setSource(s);
                setError(null);
              }}
              username={username}
              onUsernameChange={setUsername}
              onSearch={(name) => {
                setUsername(name);
                if (source !== 'pgn') void search(source, name);
              }}
              pgn={pgnText}
              onPgnChange={setPgnText}
              onPgn={loadPgn}
              loading={loading}
              recent={recent}
              collapsed={
                searched && !editingSearch && source !== 'pgn' && !error
                  ? { username: searched.username, source: searched.source, onExpand: () => setEditingSearch(true) }
                  : undefined
              }
              onRemoveRecent={(r) =>
                setRecent((prev) => {
                  const next = prev.filter((x) => !(x.source === r.source && x.username === r.username));
                  writeRecent(next);
                  return next;
                })
              }
            />

            {error && (
              <div role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div className={searched ? 'mt-5' : 'mt-8'}>
              {loading && source !== 'pgn' ? (
                <GameListSkeleton />
              ) : games.length > 0 && source !== 'pgn' ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[13px] font-bold tracking-wider text-subtle uppercase">
                      {searched?.username}&apos;s recent games
                    </h2>
                    <button
                      type="button"
                      className="icon-btn -mr-2 size-9"
                      aria-label="Refresh games"
                      onClick={() => searched && void search(searched.source, searched.username)}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  <GameList
                    key={`${searched?.source}:${searched?.username}`}
                    games={games}
                    onSelect={openGame}
                    loadingMore={loadingMore}
                    hasMore={!!cursor}
                    onLoadMore={loadMore}
                  />
                </>
              ) : (
                !error && <Features />
              )}
            </div>
          </div>
        )}
      </main>

      <footer
        className={cn(
          'border-t border-line/70 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-[12px] text-subtle',
          game && 'hidden lg:block',
        )}
      >
        Analysis by{' '}
        <a className="underline hover:text-muted" href="https://stockfishchess.org" target="_blank" rel="noreferrer">
          Stockfish
        </a>{' '}
        (GPLv3), running locally. Opening names from the{' '}
        <a className="underline hover:text-muted" href="https://github.com/lichess-org/chess-openings" target="_blank" rel="noreferrer">
          Lichess openings
        </a>{' '}
        dataset. Not affiliated with Chess.com or Lichess.
        <div className="mt-3 flex items-center justify-center gap-3 text-[13px] text-muted">
          <a className="inline-flex items-center gap-1.5 hover:text-fg" href={AUTHOR_URL} target="_blank" rel="noreferrer">
            <Github size={15} /> Made by @{AUTHOR}
          </a>
          <span aria-hidden>·</span>
          <a className="underline hover:text-fg" href={REPO_URL} target="_blank" rel="noreferrer">
            Source code
          </a>
        </div>
      </footer>
    </div>
  );
}

function Features() {
  const items = [
    { icon: Sparkles, title: 'Real explanations', text: 'Not just "?? Blunder" — see the fork, the hanging piece or the mate you missed.' },
    { icon: Cpu, title: 'Fast, parallel engine', text: 'Stockfish 17 runs on several cores at once. Reviews take seconds, not minutes.' },
    { icon: Lock, title: 'Private', text: 'Everything runs in your browser. No account, no uploads, no limits.' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title} className="card p-4">
          <Icon size={20} className="text-accent" />
          <p className="mt-2 text-[14px] font-semibold">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
        </div>
      ))}
    </div>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#81b64c" />
      <path
        fill="#fff"
        d="M16 6a3.5 3.5 0 0 0-2 6.37V13h-2.5a1 1 0 0 0 0 2H13l-1.6 7h9.2L19 15h1.5a1 1 0 0 0 0-2H18v-.63A3.5 3.5 0 0 0 16 6Zm-6 18a1 1 0 0 0-1 1v1h14v-1a1 1 0 0 0-1-1H10Z"
      />
    </svg>
  );
}
