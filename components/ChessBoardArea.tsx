'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { MoveClassification, ParsedMove } from '@/lib/analysis';

interface ChessBoardAreaProps {
  moves: ParsedMove[];
  currentMoveIndex: number;
  onMoveIndexChange: (index: number) => void;
  orientation?: 'white' | 'black';
  classifications: Record<number, MoveClassification>;
  bestMove?: string | null;
}

const BADGE_COLORS: Record<string, string> = {
  brilliant: '#1baca6',
  great: '#5c93bb',
  best: '#96bc4b',
  excellent: '#96bc4b',
  good: '#96af8b',
  inaccuracy: '#f7c631',
  mistake: '#e58f2a',
  blunder: '#ca3431',
  book: '#a88865',
  forced: '#a0a0a0',
};

const BADGE_TEXT: Record<string, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '+',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  book: '📖',
  forced: '—',
};

// Highlight colors for the moved-to square based on classification
const HIGHLIGHT_COLORS: Record<string, string> = {
  brilliant: 'rgba(27, 172, 166, 0.5)',
  great: 'rgba(92, 147, 187, 0.5)',
  best: 'rgba(150, 188, 75, 0.4)',
  excellent: 'rgba(150, 188, 75, 0.3)',
  good: 'rgba(150, 175, 139, 0.3)',
  inaccuracy: 'rgba(247, 198, 49, 0.45)',
  mistake: 'rgba(229, 143, 42, 0.5)',
  blunder: 'rgba(202, 52, 49, 0.5)',
  book: 'rgba(168, 136, 101, 0.35)',
  forced: 'rgba(160, 160, 160, 0.3)',
};

function lanToSquares(lan: string): { from: string; to: string } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(lan)) return null;
  return { from: lan.slice(0, 2), to: lan.slice(2, 4) };
}

function squareToPosition(square: string, orientation: 'white' | 'black') {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const x = orientation === 'white' ? file * 12.5 : (7 - file) * 12.5;
  const y = orientation === 'white' ? (7 - rank) * 12.5 : rank * 12.5;
  return { x, y };
}

export function ChessBoardArea({
  moves,
  currentMoveIndex,
  onMoveIndexChange,
  orientation = 'white',
  classifications,
  bestMove,
}: ChessBoardAreaProps) {
  const currentFen =
    currentMoveIndex < 0
      ? new Chess().fen()
      : (moves[currentMoveIndex]?.fenAfter ?? new Chess().fen());

  const currentMove = currentMoveIndex >= 0 ? moves[currentMoveIndex] : null;
  const squares = currentMove ? lanToSquares(currentMove.lan) : null;
  const bestMoveSquares = bestMove ? lanToSquares(bestMove) : null;
  const classification = currentMove ? classifications[currentMove.index] : null;

  // Determine if played move is different from best move
  const playedIsBest = currentMove && bestMove && currentMove.lan === bestMove;

  const customSquareStyles = useMemo(() => {
    if (!squares) return {};

    const highlightColor = classification
      ? HIGHLIGHT_COLORS[classification] || 'rgba(245, 246, 130, 0.45)'
      : 'rgba(245, 246, 130, 0.45)';

    return {
      [squares.from]: { backgroundColor: 'rgba(245, 246, 130, 0.35)' },
      [squares.to]: { backgroundColor: highlightColor },
    };
  }, [squares, classification]);

  const navigate = useCallback(
    (index: number) => {
      if (moves.length === 0) {
        onMoveIndexChange(-1);
        return;
      }
      const clamped = Math.min(moves.length - 1, Math.max(-1, index));
      onMoveIndexChange(clamped);
    },
    [moves.length, onMoveIndexChange],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') navigate(currentMoveIndex + 1);
      if (event.key === 'ArrowLeft') navigate(currentMoveIndex - 1);
      if (event.key === 'Home') navigate(-1);
      if (event.key === 'End') navigate(moves.length - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentMoveIndex, navigate, moves.length]);

  // Arrow for best move (green) — show only when played != best
  const arrows = useMemo(() => {
    const result: Array<{ startSquare: string; endSquare: string; color: string }> = [];

    // Show best move arrow when played move is NOT the best
    if (!playedIsBest && bestMoveSquares) {
      result.push({
        startSquare: bestMoveSquares.from,
        endSquare: bestMoveSquares.to,
        color: 'rgba(96, 180, 70, 0.85)',
      });
    }

    return result;
  }, [playedIsBest, bestMoveSquares]);

  return (
    <div className="flex w-full flex-col gap-0">
      <div className="board-container relative" style={{ width: '100%', maxWidth: 560 }}>
        <Chessboard
          options={{
            position: currentFen,
            boardOrientation: orientation,
            allowDragging: false,
            allowDrawingArrows: false,
            animationDurationInMs: 200,
            darkSquareStyle: { backgroundColor: '#769656' },
            lightSquareStyle: { backgroundColor: '#eeeed2' },
            squareStyles: customSquareStyles,
            arrows,
            arrowOptions: {
              color: 'rgba(96, 180, 70, 0.85)',
              secondaryColor: 'rgba(96, 180, 70, 0.85)',
              tertiaryColor: 'rgba(96, 180, 70, 0.85)',
              arrowLengthReducerDenominator: 8,
              sameTargetArrowLengthReducerDenominator: 4,
              opacity: 0.85,
              activeOpacity: 0.7,
              arrowWidthDenominator: 6,
              activeArrowWidthMultiplier: 0.9,
            },
          }}
        />

        {/* Classification badge on the target square */}
        {currentMove && classification && squares && (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: `${squareToPosition(squares.to, orientation).x}%`,
              top: `${squareToPosition(squares.to, orientation).y}%`,
              width: '12.5%',
              height: '12.5%',
            }}
          >
            <div className="relative h-full w-full">
              <div
                className="absolute flex items-center justify-center rounded-full shadow-lg"
                style={{
                  width: 22,
                  height: 22,
                  top: -6,
                  right: -6,
                  backgroundColor: BADGE_COLORS[classification] || '#666',
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#fff',
                  border: '2px solid rgba(0,0,0,0.3)',
                  lineHeight: 1,
                }}
              >
                {BADGE_TEXT[classification] || ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation bar */}
      <div
        className="flex items-center justify-center gap-1 rounded-b"
        style={{ background: '#272522', padding: '6px 8px' }}
      >
        <button
          className="nav-btn"
          onClick={() => navigate(-1)}
          disabled={currentMoveIndex <= -1}
          title="First move"
        >
          ⏮
        </button>
        <button
          className="nav-btn"
          onClick={() => navigate(currentMoveIndex - 1)}
          disabled={currentMoveIndex <= -1}
          title="Previous"
        >
          ◀
        </button>
        <button
          className="nav-btn"
          onClick={() => navigate(currentMoveIndex + 1)}
          disabled={currentMoveIndex >= moves.length - 1}
          title="Next"
        >
          ▶
        </button>
        <button
          className="nav-btn"
          onClick={() => navigate(moves.length - 1)}
          disabled={currentMoveIndex >= moves.length - 1}
          title="Last move"
        >
          ⏭
        </button>
      </div>
    </div>
  );
}
