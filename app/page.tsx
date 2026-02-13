'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { fetchPlayerGames, ChessGame } from '@/lib/chess-api';
import { parsePgnMoves, evalToCpFromTurnPerspective, MoveClassification } from '@/lib/analysis';
import { useStockfish } from '@/hooks/useStockfish';
import { GameList } from '@/components/GameList';
import { ChessBoardArea } from '@/components/ChessBoardArea';
import { EvaluationBar } from '@/components/EvaluationBar';
import { MovePanel } from '@/components/MovePanel';
import { Evaluation } from '@/lib/stockfish';

/* ── Classification summary helpers ── */
const CL_ORDER: MoveClassification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'book', 'inaccuracy', 'mistake', 'blunder', 'forced',
];

const CL_LABELS: Record<string, string> = {
  brilliant: '!!', great: '!', best: '★', excellent: '✓',
  good: '+', inaccuracy: '?!', mistake: '?', blunder: '??',
  book: '📖', forced: '—',
};

function openingPlyFromPgn(pgn: string): number {
  const hasECO = /\[ECO\s+"[A-E]\d{2}"\]/.test(pgn);
  return hasECO ? 12 : 8;
}

export default function Home() {
  const [username, setUsername] = useState('');
  const [games, setGames] = useState<ChessGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [selectedGame, setSelectedGame] = useState<ChessGame | null>(null);
  const [error, setError] = useState('');
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);

  const parsedMoves = useMemo(
    () => (selectedGame ? parsePgnMoves(selectedGame.pgn) : []),
    [selectedGame],
  );

  const {
    analyzeGame,
    isAnalyzing,
    progress,
    evaluations,
    classifications,
    bestMoves,
    centipawnLoss,
    winChances,
  } = useStockfish();

  useEffect(() => {
    const stored = localStorage.getItem('chess_username');
    if (stored) setUsername(stored);
  }, []);

  useEffect(() => {
    if (username) localStorage.setItem('chess_username', username);
  }, [username]);

  useEffect(() => {
    setCurrentMoveIndex(-1);
  }, [selectedGame?.uuid]);

  const handleFetchGames = async () => {
    if (!username.trim()) return;
    setLoadingGames(true);
    setError('');
    setSelectedGame(null);
    try {
      const fetched = await fetchPlayerGames(username);
      setGames(fetched);
      if (fetched.length === 0) setError('No games found for this account.');
    } catch {
      setError('Unable to fetch games. Check the username.');
      setGames([]);
    } finally {
      setLoadingGames(false);
    }
  };

  const orientation: 'white' | 'black' =
    selectedGame && selectedGame.white.username.toLowerCase() !== username.toLowerCase()
      ? 'black'
      : 'white';

  // Current evaluation for the eval bar (from white's perspective)
  const currentEval: Evaluation | null = currentMoveIndex >= 0 ? evaluations[currentMoveIndex] ?? null : null;
  const currentMove = currentMoveIndex >= 0 ? parsedMoves[currentMoveIndex] : null;

  // Build a "white perspective" evaluation for the bar
  const evalForBar: Evaluation | null = useMemo(() => {
    if (!currentEval) return null;
    // currentEval is from the side-to-move perspective (turn AFTER the move)
    // We need to convert to white's perspective
    const turnAfter = currentMove ? (currentMove.turn === 'w' ? 'b' : 'w') : 'w';
    const cp = evalToCpFromTurnPerspective(currentEval);
    const whiteCp = turnAfter === 'w' ? cp : -cp;
    return { ...currentEval, cp: whiteCp, mate: currentEval.mate != null ? (turnAfter === 'w' ? currentEval.mate : -currentEval.mate) : undefined };
  }, [currentEval, currentMove]);

  const bestMoveForBoard = currentMoveIndex < 0 ? bestMoves[0] : bestMoves[currentMoveIndex];

  // Classification summary counts
  const classificationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(classifications).forEach((cl) => {
      if (cl) counts[cl] = (counts[cl] || 0) + 1;
    });
    return counts;
  }, [classifications]);

  const hasAnalysis = Object.keys(classifications).length > 0;

  // Player info
  const whitePlayer = selectedGame?.white;
  const blackPlayer = selectedGame?.black;

  return (
    <main style={{ minHeight: '100vh', background: '#312e2b', color: '#f0f0f0' }}>
      {/* Top bar */}
      <div
        style={{
          background: '#272522',
          borderBottom: '1px solid #464442',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: '#81b64c', letterSpacing: '-0.5px' }}>
          ♟ Game Review
        </div>

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Chess.com username"
            onKeyDown={(e) => e.key === 'Enter' && handleFetchGames()}
            style={{
              background: '#1e1c1a',
              border: '1px solid #464442',
              borderRadius: 4,
              padding: '7px 12px',
              color: '#f0f0f0',
              fontSize: 14,
              width: 200,
              outline: 'none',
            }}
          />
          <button
            onClick={handleFetchGames}
            disabled={loadingGames}
            style={{
              background: '#81b64c',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '7px 16px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              opacity: loadingGames ? 0.6 : 1,
            }}
          >
            {loadingGames ? 'Loading...' : 'Load Games'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 20px', background: '#3a2020', color: '#ef8d8d', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          maxWidth: 1400,
          margin: '0 auto',
          gap: 0,
          minHeight: 'calc(100vh - 50px)',
        }}
      >
        {/* ── Left sidebar: Game list ── */}
        <aside
          style={{
            background: '#272522',
            borderRight: '1px solid #464442',
            padding: '12px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a0a0a0', marginBottom: 8 }}>
            RECENT GAMES
          </div>
          <GameList
            games={games}
            username={username}
            onSelectGame={setSelectedGame}
            selectedGameId={selectedGame?.uuid ?? null}
          />
        </aside>

        {/* ── Main content ── */}
        <section style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selectedGame && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '70vh',
                color: '#888',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>♟</div>
                <div style={{ fontSize: 16, color: '#c0c0c0' }}>Select a game to review</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Enter your Chess.com username and load your games
                </div>
              </div>
            </div>
          )}

          {selectedGame && (
            <>
              {/* Analysis button + progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => analyzeGame(parsedMoves, openingPlyFromPgn(selectedGame.pgn))}
                  disabled={isAnalyzing || parsedMoves.length === 0}
                  style={{
                    background: isAnalyzing ? '#3c3a38' : '#81b64c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '8px 20px',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: isAnalyzing ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {isAnalyzing ? (
                    <>
                      <span className="animate-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #666', borderTopColor: '#81b64c', borderRadius: '50%' }} />
                      Analyzing... {Math.round(progress)}%
                    </>
                  ) : (
                    <>▶ {hasAnalysis ? 'Re-Analyze' : 'Run Analysis'}</>
                  )}
                </button>

                {isAnalyzing && (
                  <div style={{ flex: 1, maxWidth: 300 }}>
                    <div className="analysis-progress">
                      <div className="analysis-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Main board area: Eval | Board | Moves */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '30px minmax(360px, 560px) minmax(260px, 340px)',
                  gap: 0,
                  alignItems: 'stretch',
                }}
              >
                {/* Eval bar */}
                <div style={{ paddingTop: 32, paddingBottom: 32 }}>
                  <EvaluationBar evaluation={evalForBar} orientation={orientation} />
                </div>

                {/* Board + player bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Top player (opponent) */}
                  <PlayerBar
                    player={orientation === 'white' ? blackPlayer : whitePlayer}
                    color={orientation === 'white' ? 'b' : 'w'}
                  />

                  <ChessBoardArea
                    moves={parsedMoves}
                    currentMoveIndex={currentMoveIndex}
                    onMoveIndexChange={setCurrentMoveIndex}
                    orientation={orientation}
                    classifications={classifications}
                    bestMove={bestMoveForBoard ?? null}
                  />

                  {/* Bottom player (you) */}
                  <PlayerBar
                    player={orientation === 'white' ? whitePlayer : blackPlayer}
                    color={orientation === 'white' ? 'w' : 'b'}
                  />
                </div>

                {/* Move panel */}
                <div style={{ minHeight: 400, maxHeight: 620, display: 'flex', flexDirection: 'column' }}>
                  <MovePanel
                    moves={parsedMoves}
                    currentMoveIndex={currentMoveIndex}
                    onMoveIndexChange={setCurrentMoveIndex}
                    classifications={classifications}
                    bestMoves={bestMoves}
                    centipawnLoss={centipawnLoss}
                    isAnalyzing={isAnalyzing}
                  />
                </div>
              </div>

              {/* Classification summary */}
              {hasAnalysis && (
                <div
                  style={{
                    display: 'flex',
                    gap: 14,
                    flexWrap: 'wrap',
                    padding: '10px 14px',
                    background: '#272522',
                    borderRadius: 4,
                  }}
                >
                  {CL_ORDER.map((cl) => {
                    const count = classificationCounts[cl!] || 0;
                    if (count === 0 || !cl) return null;
                    return (
                      <div key={cl} className="summary-item">
                        <span className={`cl-dot bg-${cl}`} style={{ width: 16, height: 16, fontSize: 8 }}>
                          {CL_LABELS[cl]}
                        </span>
                        <span className={`cc-${cl}`}>{cl.charAt(0).toUpperCase() + cl.slice(1)}</span>
                        <span className="count">×{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

/* ── Player bar ── */
function PlayerBar({ player, color }: { player?: { username: string; rating: number } | null; color: 'w' | 'b' }) {
  if (!player) return null;
  return (
    <div className="player-bar">
      <div
        className="avatar"
        style={{ background: color === 'w' ? '#f0f0f0' : '#3c3a38', color: color === 'w' ? '#272522' : '#f0f0f0' }}
      >
        {player.username.charAt(0).toUpperCase()}
      </div>
      <span>{player.username}</span>
      <span className="rating">({player.rating})</span>
    </div>
  );
}
