export interface ChessGame {
  url: string;
  uuid: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  white: {
    username: string;
    rating: number;
    result: string;
  };
  black: {
    username: string;
    rating: number;
    result: string;
  };
}

async function fetchArchive(url: string): Promise<ChessGame[]> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.games ?? []) as ChessGame[];
}

export async function fetchPlayerGames(username: string): Promise<ChessGame[]> {
  const profile = username.trim().toLowerCase();
  if (!profile) return [];

  const archivesRes = await fetch(`https://api.chess.com/pub/player/${profile}/games/archives`, { cache: 'no-store' });
  if (!archivesRes.ok) {
    throw new Error('User not found or Chess.com API unavailable.');
  }

  const archivesData = await archivesRes.json();
  const archives = (archivesData.archives ?? []) as string[];

  if (archives.length === 0) return [];

  const recentArchives = archives.slice(-6).reverse();
  const batches = await Promise.all(recentArchives.map((archiveUrl) => fetchArchive(archiveUrl)));

  return batches
    .flat()
    .filter((game) => game?.pgn)
    .sort((a, b) => b.end_time - a.end_time);
}
