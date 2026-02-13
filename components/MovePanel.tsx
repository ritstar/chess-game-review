'use client';

import { useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { MoveClassification, ParsedMove } from '@/lib/analysis';

interface MovePanelProps {
    moves: ParsedMove[];
    currentMoveIndex: number;
    onMoveIndexChange: (index: number) => void;
    classifications: Record<number, MoveClassification>;
    bestMoves: Record<number, string>;
    centipawnLoss: Record<number, number>;
    isAnalyzing: boolean;
}

const CLASSIFICATION_SYMBOLS: Record<string, string> = {
    brilliant: '!!',
    great: '!',
    best: '★',
    excellent: '',
    good: '',
    inaccuracy: '?!',
    mistake: '?',
    blunder: '??',
    book: '📖',
    forced: '—',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
    brilliant: 'Brilliant',
    great: 'Great move',
    best: 'Best move',
    excellent: 'Excellent',
    good: 'Good move',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    blunder: 'Blunder',
    book: 'Book move',
    forced: 'Forced',
};

function getMoveDescription(
    move: ParsedMove,
    classification: MoveClassification,
    bestMove: string | undefined,
): { title: string; detail: string } {
    if (!classification) return { title: '', detail: '' };

    const label = CLASSIFICATION_LABELS[classification] || '';
    const symbol = CLASSIFICATION_SYMBOLS[classification] || '';

    if (classification === 'best' || classification === 'brilliant' || classification === 'great') {
        return {
            title: `${label}${symbol ? ` ${symbol}` : ''}`,
            detail: `${move.san} was the best move in this position.`,
        };
    }

    if (classification === 'excellent' || classification === 'good') {
        return {
            title: label,
            detail: `${move.san} was a strong move.`,
        };
    }

    if (classification === 'book') {
        return {
            title: 'Book move',
            detail: 'This move is part of standard opening theory.',
        };
    }

    if (classification === 'forced') {
        return {
            title: 'Forced',
            detail: 'This was the only legal move.',
        };
    }

    // Inaccuracy, mistake, blunder
    const bestSan = bestMove || '...';
    return {
        title: `${label}${symbol ? ` ${symbol}` : ''}`,
        detail: `${bestSan} was best.`,
    };
}

export function MovePanel({
    moves,
    currentMoveIndex,
    onMoveIndexChange,
    classifications,
    bestMoves,
    centipawnLoss,
    isAnalyzing,
}: MovePanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLDivElement>(null);

    // Scroll active move into view
    useEffect(() => {
        if (activeRef.current && scrollRef.current) {
            const container = scrollRef.current;
            const el = activeRef.current;
            const containerRect = container.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();

            if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [currentMoveIndex]);

    // Group moves into pairs (white, black)
    const pairs: Array<{ moveNumber: number; white: ParsedMove | null; black: ParsedMove | null }> = [];
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        if (move.turn === 'w') {
            pairs.push({
                moveNumber: Math.ceil(move.ply / 2),
                white: move,
                black: moves[i + 1]?.turn === 'b' ? moves[i + 1] : null,
            });
            if (moves[i + 1]?.turn === 'b') i++;
        } else {
            // Black move without white (shouldn't happen normally)
            pairs.push({
                moveNumber: Math.ceil(move.ply / 2),
                white: null,
                black: move,
            });
        }
    }

    const selectedMove = currentMoveIndex >= 0 ? moves[currentMoveIndex] : null;
    const selectedClass = selectedMove ? classifications[selectedMove.index] : null;
    const desc = selectedMove && selectedClass
        ? getMoveDescription(selectedMove, selectedClass, bestMoves[selectedMove.index])
        : null;

    // Convert bestMove LAN to SAN for display
    function bestMoveSan(moveIndex: number, fenBefore: string): string {
        const lan = bestMoves[moveIndex];
        if (!lan) return '';
        try {
            const g = new Chess(fenBefore);
            const result = g.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] || undefined });
            return result?.san || lan;
        } catch {
            return lan;
        }
    }

    return (
        <div className="flex h-full flex-col bg-[#272522] rounded overflow-hidden">
            {/* Move list */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-1">
                {pairs.map((pair) => (
                    <div key={pair.moveNumber} className="move-row">
                        <div className="move-number">{pair.moveNumber}.</div>

                        {pair.white ? (
                            <MoveCell
                                move={pair.white}
                                isActive={pair.white.index === currentMoveIndex}
                                classification={classifications[pair.white.index]}
                                onClick={() => onMoveIndexChange(pair.white!.index)}
                                ref={pair.white.index === currentMoveIndex ? activeRef : undefined}
                            />
                        ) : (
                            <div className="move-cell" style={{ opacity: 0.3 }}>...</div>
                        )}

                        {pair.black ? (
                            <MoveCell
                                move={pair.black}
                                isActive={pair.black.index === currentMoveIndex}
                                classification={classifications[pair.black.index]}
                                onClick={() => onMoveIndexChange(pair.black!.index)}
                                ref={pair.black.index === currentMoveIndex ? activeRef : undefined}
                            />
                        ) : (
                            <div />
                        )}
                    </div>
                ))}
            </div>

            {/* Move description */}
            {desc && selectedClass && (
                <div className="move-desc">
                    <div className={`desc-title cc-${selectedClass}`}>
                        {desc.title}
                    </div>
                    <div className="desc-detail">
                        {selectedClass && ['inaccuracy', 'mistake', 'blunder'].includes(selectedClass) && selectedMove ? (
                            <>
                                <span className="cc-best" style={{ fontWeight: 600 }}>
                                    {bestMoveSan(selectedMove.index, selectedMove.fenBefore)}
                                </span>{' '}
                                was best.
                            </>
                        ) : (
                            desc.detail
                        )}
                    </div>
                </div>
            )}

            {!desc && (
                <div className="move-desc" style={{ minHeight: 52 }}>
                    <div className="desc-detail" style={{ color: '#888' }}>
                        {isAnalyzing ? 'Analyzing...' : currentMoveIndex < 0 ? 'Select a move to see details' : 'Pending analysis'}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Move cell ── */
import { forwardRef } from 'react';

interface MoveCellProps {
    move: ParsedMove;
    isActive: boolean;
    classification: MoveClassification;
    onClick: () => void;
}

const MoveCell = forwardRef<HTMLDivElement, MoveCellProps>(
    ({ move, isActive, classification, onClick }, ref) => {
        const cls = classification || '';
        const symbol = cls ? CLASSIFICATION_SYMBOLS[cls] : '';
        const showDot = cls && cls !== 'excellent' && cls !== 'good' && cls !== 'forced';

        return (
            <div
                ref={ref}
                className={`move-cell ${isActive ? `active cl-${cls}` : ''}`}
                onClick={onClick}
            >
                {showDot && (
                    <span className={`cl-dot bg-${cls}`}>
                        {symbol}
                    </span>
                )}
                <span>{move.san}</span>
            </div>
        );
    }
);

MoveCell.displayName = 'MoveCell';
