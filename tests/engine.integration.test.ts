import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { analyseGame } from '@/lib/analysis/pipeline';
import { buildReview } from '@/lib/analysis/review';
import type { OpeningBook } from '@/lib/analysis/openings';
import { EnginePool } from '@/lib/engine/stockfish';
import { parseGame } from '@/lib/games/pgn';
import { DEPTH_PRESETS } from '@/lib/settings';
import { nodeEngine } from './helpers/node-engine';

/** End-to-end: the real Stockfish build + the real review pipeline. */
describe('review pipeline with Stockfish', () => {
  const pool = new EnginePool(2, nodeEngine);
  const book = JSON.parse(readFileSync('public/data/openings.json', 'utf8')) as OpeningBook;
  afterAll(() => pool.terminate());

  async function review(pgn: string) {
    const { plies, startFen } = parseGame(pgn);
    const positions = await analyseGame({ plies, startFen, pool, preset: DEPTH_PRESETS.fast, book });
    return { plies, positions, result: buildReview(plies, positions, book) };
  }

  it('flags the scholar’s mate blunder and explains it', async () => {
    const { result } = await review('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
    const moves = result.moves.map((m) => m!.classification);
    expect(moves.slice(0, 2)).toEqual(['book', 'book']);
    expect(moves[5]).toBe('blunder');
    expect(result.moves[5]!.explanation.details[0]).toMatch(/allows checkmate in 1/);
    expect(moves[6]).toBe('best');
    expect(result.evals.at(-1)).toMatchObject({ terminal: 'checkmate', win: 100 });
    expect(result.opening?.name).toMatch(/Bishop's Opening|Italian|King's Pawn/);
    expect(result.black.accuracy!).toBeLessThan(result.white.accuracy!);
  }, 60_000);

  it('gives the same result every time', async () => {
    const pgn = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 h6 8. Bh4 Qb6';
    const a = await review(pgn);
    const b = await review(pgn);
    expect(b.positions).toEqual(a.positions);
  }, 120_000);

  it('scores the played move inside the same search', async () => {
    // 3...Qg5?? is nowhere near the engine's top three, so it gets its own search.
    const { positions } = await review('1. e4 e5 2. Nf3 d6 3. d4 Qg5');
    expect(positions[5].played?.pv[0]).toBe('d8g5');
  }, 60_000);

  it('explains a hung piece', async () => {
    // 3...Qg5?? walks the queen into Nxg5.
    const { result } = await review('1. e4 e5 2. Nf3 d6 3. d4 Qg5 4. Nxg5');
    const blunder = result.moves[5]!;
    expect(blunder.classification).toBe('blunder');
    expect(blunder.explanation.details.join(' ')).toMatch(/queen/);
  }, 60_000);
});
