'use client';

import { ChessGame } from '@/lib/chess-api';
import { cn } from '@/lib/utils';

interface GameListProps {
  games: ChessGame[];
  onSelectGame: (game: ChessGame) => void;
  selectedGameId?: string | null;
  username: string;
}

function normalizeResult(result: string): 'Won' | 'Lost' | 'Draw' {
  if (result === 'win') return 'Won';
  if (['checkmated', 'resigned', 'timeout', 'lose', 'abandoned'].includes(result)) return 'Lost';
  return 'Draw';
}

export function GameList({ games, onSelectGame, selectedGameId, username }: GameListProps) {
  if (games.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">No games loaded.</div>;
  }

  return (
    <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
      {games.map((game) => {
        const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
        const player = isWhite ? game.white : game.black;
        const opponent = isWhite ? game.black : game.white;
        const result = normalizeResult(player.result || 'draw');
        const gameDate = new Date(game.end_time * 1000);

        return (
          <button
            key={game.uuid}
            type="button"
            onClick={() => onSelectGame(game)}
            className={cn(
              'w-full rounded-md border px-3 py-3 text-left transition-colors',
              selectedGameId === game.uuid
                ? 'border-[#82a95b] bg-[#2b3525]'
                : 'border-border/70 bg-card/70 hover:bg-[#222] hover:border-[#4f5f47]',
            )}
          >
            <div className="mb-2 flex items-center justify-between text-xs">
              <span
                className={cn(
                  'rounded px-2 py-0.5 font-semibold',
                  result === 'Won' && 'bg-[#2e4e27] text-[#9bd674]',
                  result === 'Lost' && 'bg-[#4f2929] text-[#ef8d8d]',
                  result === 'Draw' && 'bg-[#383838] text-[#d2d2d2]',
                )}
              >
                {result}
              </span>
              <span className="text-muted-foreground">{gameDate.toLocaleDateString()}</span>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Opponent</span>
                <span className="font-medium">{opponent.username}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Ratings</span>
                <span>
                  {player.rating} vs {opponent.rating}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Time</span>
                <span>{game.time_control}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
