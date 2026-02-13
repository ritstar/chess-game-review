import { useCallback, useEffect, useRef, useState } from 'react';
import { Evaluation, StockfishEngine } from '@/lib/stockfish';
import { ParsedMove, MoveClassification, classifyMove, evalToCpFromTurnPerspective, winChance } from '@/lib/analysis';
import { Chess } from 'chess.js';

interface AnalysisMap {
  evaluations: Record<number, Evaluation>;
  classifications: Record<number, MoveClassification>;
  bestMoves: Record<number, string>;
  centipawnLoss: Record<number, number>;
  winChances: Record<number, number>; // win% for white after each move
}

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisMap>({
    evaluations: {},
    classifications: {},
    bestMoves: {},
    centipawnLoss: {},
    winChances: {},
  });

  useEffect(() => {
    engineRef.current = new StockfishEngine();
    return () => {
      engineRef.current?.quit();
      engineRef.current = null;
    };
  }, []);

  const analyzeGame = useCallback(async (moves: ParsedMove[], openingPlyLimit = 10) => {
    if (!engineRef.current || moves.length === 0) return;

    setIsAnalyzing(true);
    setProgress(0);
    setAnalysis({
      evaluations: {},
      classifications: {},
      bestMoves: {},
      centipawnLoss: {},
      winChances: {},
    });

    const evaluations: Record<number, Evaluation> = {};
    const classifications: Record<number, MoveClassification> = {};
    const bestMoves: Record<number, string> = {};
    const centipawnLoss: Record<number, number> = {};
    const winChances: Record<number, number> = {};

    // Store position evaluations (before each move)
    const positionEvals: Evaluation[] = [];
    const afterEvals: Evaluation[] = [];

    try {
      const totalSteps = moves.length * 2; // 2 evals per move (before + after)

      // ── Pass 1: Evaluate all positions ──
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];

        // Evaluate position BEFORE this move
        const beforeResults = await engineRef.current.analyzePosition(move.fenBefore, {
          depth: 18,
          timeoutMs: 8000,
          multiPv: 1,
        });
        positionEvals.push(beforeResults[0]);

        // Evaluate position AFTER this move
        const afterResults = await engineRef.current.analyzePosition(move.fenAfter, {
          depth: 18,
          timeoutMs: 8000,
          multiPv: 1,
        });
        afterEvals.push(afterResults[0]);

        setProgress(((i * 2 + 2) / totalSteps) * 100);
      }

      // ── Pass 2: Classify all moves ──
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const evalBefore = positionEvals[i];
        const evalAfterMove = afterEvals[i];
        const bestMove = evalBefore.bestMove ?? '';

        // Check if this is a forced move (only one legal move)
        let isOnlyLegalMove = false;
        try {
          const g = new Chess(move.fenBefore);
          isOnlyLegalMove = g.moves().length <= 1;
        } catch {
          // ignore
        }

        // For potential "great" moves, we could do MultiPV2 analysis
        // but to keep analysis fast, we'll use heuristics
        let secondBestEval: Evaluation | null = null;
        if (move.lan === bestMove) {
          // Do a quick MultiPV 2 check for great move detection
          try {
            const mpvResults = await engineRef.current.analyzePosition(move.fenBefore, {
              depth: 14, // slightly lower depth for speed
              timeoutMs: 5000,
              multiPv: 2,
            });
            if (mpvResults[1] && (mpvResults[1].cp !== undefined || mpvResults[1].mate !== undefined)) {
              // The second PV eval is from the mover's perspective
              // We need to simulate playing the second-best move and get the resulting eval
              secondBestEval = mpvResults[1];
            }
          } catch {
            // ignore
          }
        }

        const verdict = classifyMove({
          move,
          evalBefore,
          evalAfter: evalAfterMove,
          bestMove,
          openingPlyLimit,
          secondBestEval,
          isOnlyLegalMove,
        });

        evaluations[move.index] = evalAfterMove;
        classifications[move.index] = verdict.classification;
        bestMoves[move.index] = bestMove;
        centipawnLoss[move.index] = verdict.centipawnLoss;

        // Compute win chance from white's perspective after this move
        const cpAfter = evalToCpFromTurnPerspective(evalAfterMove);
        // evalAfter is from the new side-to-move perspective
        // If it was white's move (turn='w'), after the move it's black's turn
        // So cpAfter is from black's perspective -> white's = -cpAfter
        const whiteCp = move.turn === 'w' ? -cpAfter : cpAfter;
        winChances[move.index] = winChance(whiteCp);

        setAnalysis({
          evaluations: { ...evaluations },
          classifications: { ...classifications },
          bestMoves: { ...bestMoves },
          centipawnLoss: { ...centipawnLoss },
          winChances: { ...winChances },
        });
      }

      setProgress(100);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  return {
    analyzeGame,
    isAnalyzing,
    progress,
    evaluations: analysis.evaluations,
    classifications: analysis.classifications,
    bestMoves: analysis.bestMoves,
    centipawnLoss: analysis.centipawnLoss,
    winChances: analysis.winChances,
  };
}
