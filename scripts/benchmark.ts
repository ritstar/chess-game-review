/**
 * Runs the real review pipeline (same Stockfish build, same two-pass
 * analysis) over Chess.com games and compares our accuracy with the number
 * Chess.com itself reported for each game.
 *
 *   npx vite-node --config vitest.config.ts scripts/benchmark.ts -- <games.json...> [--limit N] [--preset standard] [--out dir]
 *
 * Input files are Chess.com monthly archive responses
 * (https://api.chess.com/pub/player/<user>/games/<yyyy>/<mm>). Only games
 * that were reviewed on Chess.com carry an `accuracies` field; the rest are
 * skipped. Engine output is saved per game in --out so classification and
 * accuracy changes can be re-scored without searching again (--rescore).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyseGame } from '@/lib/analysis/pipeline';
import type { OpeningBook } from '@/lib/analysis/openings';
import { buildReview } from '@/lib/analysis/review';
import { EnginePool } from '@/lib/engine/stockfish';
import type { PositionAnalysis } from '@/lib/engine/uci';
import { parseGame } from '@/lib/games/pgn';
import { DEPTH_PRESETS, type AnalysisDepth } from '@/lib/settings';
import { nodeEngine } from '../tests/helpers/node-engine';

interface ArchiveGame {
  url: string;
  pgn?: string;
  rules?: string;
  accuracies?: { white: number; black: number };
  white: { rating: number };
  black: { rating: number };
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const limit = Number(flag('limit') ?? Infinity);
const preset = (flag('preset') ?? 'standard') as AnalysisDepth;
const out = flag('out') ?? 'benchmark-cache';
const rescore = args.includes('--rescore');
const files = args.filter((a) => !a.startsWith('--'));

const book = JSON.parse(readFileSync('public/data/openings.json', 'utf8')) as OpeningBook;
const seen = new Set<string>();
const games: ArchiveGame[] = [];
for (const f of files) {
  for (const g of (JSON.parse(readFileSync(f, 'utf8')) as { games?: ArchiveGame[] }).games ?? []) {
    if (seen.has(g.url) || g.rules !== 'chess' || !g.accuracies || !g.pgn) continue;
    seen.add(g.url);
    games.push(g);
  }
}

mkdirSync(out, { recursive: true });
const pool = new EnginePool(4, nodeEngine);
const rows: { url: string; rating: number; ours: number; theirs: number; seconds: number }[] = [];

for (const g of games.slice(0, limit)) {
  let parsed;
  try {
    parsed = parseGame(g.pgn!);
  } catch {
    continue;
  }
  if (parsed.plies.length < 20) continue;
  const file = path.join(out, `${preset}-${g.url.split('/').pop()}.json`);
  const started = Date.now();
  let positions: PositionAnalysis[];
  if (existsSync(file)) positions = JSON.parse(readFileSync(file, 'utf8'));
  else if (rescore) continue;
  else {
    let firstPass = 0;
    positions = await analyseGame({
      ...parsed,
      pool,
      preset: DEPTH_PRESETS[preset],
      book,
      onProgress: (_, __, stage) => {
        if (stage === 'deep' && !firstPass) firstPass = (Date.now() - started) / 1000;
      },
    });
    console.log(`  first pass ${firstPass.toFixed(1)}s, deep pass ${((Date.now() - started) / 1000 - firstPass).toFixed(1)}s`);
    writeFileSync(file, JSON.stringify(positions));
  }
  const seconds = (Date.now() - started) / 1000;
  const review = buildReview(parsed.plies, positions, book);
  for (const color of ['white', 'black'] as const) {
    const ours = review[color].accuracy;
    if (ours == null) continue;
    rows.push({ url: g.url, rating: g[color].rating, ours, theirs: g.accuracies![color], seconds });
  }
  const last = rows.slice(-2);
  console.log(
    `${g.url.split('/').pop()} ${parsed.plies.length} plies ${seconds.toFixed(1)}s  ` +
      last.map((r) => `${r.rating}: ours ${r.ours.toFixed(1)} vs ${r.theirs.toFixed(1)}`).join('  |  '),
  );
}
pool.terminate();

const diffs = rows.map((r) => r.ours - r.theirs);
const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
const mae = diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length;
const n = rows.length;
const mx = rows.reduce((a, r) => a + r.ours, 0) / n;
const my = rows.reduce((a, r) => a + r.theirs, 0) / n;
const cov = rows.reduce((a, r) => a + (r.ours - mx) * (r.theirs - my), 0);
const corr = cov / Math.sqrt(rows.reduce((a, r) => a + (r.ours - mx) ** 2, 0) * rows.reduce((a, r) => a + (r.theirs - my) ** 2, 0));
console.log(`\n${n} player-games · mean difference ${mean.toFixed(2)} · mean absolute error ${mae.toFixed(2)} · correlation ${corr.toFixed(3)}`);
writeFileSync(path.join(out, `results-${preset}.json`), JSON.stringify(rows, null, 1));
