import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { buildReview, terminalEval } from '@/lib/analysis/review';
import type { OpeningBook } from '@/lib/analysis/openings';
import type { PositionAnalysis } from '@/lib/engine/uci';
import { parseGame } from '@/lib/games/pgn';
import { NodeEngine } from './helpers/node-engine';

/** End-to-end: the real Stockfish build + the real review pipeline. */
describe('review pipeline with Stockfish', () => {
  const engine = new NodeEngine();
  const book = JSON.parse(readFileSync('public/data/openings.json', 'utf8')) as OpeningBook;
  afterAll(() => engine.quit());

  async function review(pgn: string) {
    const { plies, startFen } = parseGame(pgn);
    const positions: PositionAnalysis[] = [];
    for (const fen of [startFen, ...plies.map((p) => p.fenAfter)]) {
      positions.push(terminalEval(fen) ? { fen, depth: 0, lines: [] } : await engine.analyse(fen, 12));
    }
    return { plies, result: buildReview(plies, positions, book) };
  }

  it('flags the scholar’s mate blunder and explains it', async () => {
    const { result } = await review('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
    const moves = result.moves.map((m) => m!.classification);
    expect(moves.slice(0, 2)).toEqual(['book', 'book']);
    expect(moves[5]).toBe('blunder');
    expect(result.moves[5]!.explanation.details[0]).toMatch(/Allows mate in 1/);
    expect(moves[6]).toBe('best');
    expect(result.evals.at(-1)).toMatchObject({ terminal: 'checkmate', win: 100 });
    expect(result.opening?.name).toMatch(/Bishop's Opening|Italian|King's Pawn/);
    expect(result.black.accuracy!).toBeLessThan(result.white.accuracy!);
  }, 60_000);

  it('explains a hung piece', async () => {
    // 3...Qg5?? walks the queen into Nxg5.
    const { result } = await review('1. e4 e5 2. Nf3 d6 3. d4 Qg5 4. Nxg5');
    const blunder = result.moves[5]!;
    expect(blunder.classification).toBe('blunder');
    expect(blunder.explanation.details.join(' ')).toMatch(/queen/);
  }, 60_000);
});
