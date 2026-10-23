#!/usr/bin/env node
/**
 * Builds public/data/openings.json from the Lichess chess-openings dataset
 * (https://github.com/lichess-org/chess-openings, public domain / CC0).
 *
 * Output: { [epd]: [eco, name] } where epd is the FEN without move counters.
 * Every position reached along each named line is recorded, so any move that
 * stays inside known theory is recognised as a book move.
 *
 * Usage: node scripts/build-openings.mjs [dir-with-tsv-files]
 *   With no argument the TSV files are downloaded from GitHub.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Chess } from 'chess.js';

const FILES = ['a', 'b', 'c', 'd', 'e'];
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

async function loadTsv(name, dir) {
  if (dir) return readFile(path.join(dir, `${name}.tsv`), 'utf8');
  const res = await fetch(`${BASE}/${name}.tsv`);
  if (!res.ok) throw new Error(`Failed to download ${name}.tsv: ${res.status}`);
  return res.text();
}

const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

const dir = process.argv[2];
/** @type {Map<string, {eco: string, name: string, plies: number, named: boolean}>} */
const book = new Map();

for (const file of FILES) {
  const text = await loadTsv(file, dir);
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    const replay = new Chess();
    moves.forEach((san, i) => {
      replay.move(san);
      const key = epd(replay.fen());
      const isFinal = i === moves.length - 1;
      const existing = book.get(key);
      // Prefer the entry that names this exact position; otherwise keep the
      // shortest line passing through it (its most general name).
      if (
        !existing ||
        (isFinal && !existing.named) ||
        (isFinal === existing.named && moves.length < existing.plies)
      ) {
        book.set(key, { eco, name, plies: moves.length, named: isFinal });
      }
    });
  }
}

const out = {};
for (const [key, v] of [...book.entries()].sort()) out[key] = [v.eco, v.name];

const target = path.join(process.cwd(), 'public', 'data', 'openings.json');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} positions to ${path.relative(process.cwd(), target)}`);
