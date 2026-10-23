# ♟ Game Review

Free, private game review for **Chess.com** and **Lichess** games, powered by **Stockfish 17** running entirely in your browser.

Load your games by username (or paste a PGN / Lichess link) and get:

- **Move classifications**: Brilliant `!!`, Great `!`, Best, Excellent, Good, Book, Forced, Inaccuracy `?!`, Mistake `?`, Miss, Blunder `??`
- **Explanations in plain English**: "Allows a fork: Ne3 attacks your queen on d1 and rook on f1", "Missed mate in 2: …", "This leaves the bishop on f6 undefended", with the best line and the opponent's refutation
- **Accuracy** for both players, plus average centipawn loss
- **Evaluation graph** with the key moments marked; click or drag it to jump around
- **Engine lines**: top 3 Stockfish lines for every position (hover one to see it on the board)
- **Opening names** from a 3,800-line opening book; theory moves are marked as Book
- Clocks, captured material, best-move arrows, autoplay, board themes and keyboard navigation
- Shareable URLs (`?src=chesscom&u=<user>&g=<game>`). Finished reviews are cached in IndexedDB, so reopening a game is instant.

## How the analysis works

| Step | What happens |
|---|---|
| Engine | Each position is searched once with MultiPV 3 (Standard: depth 16, capped at 1.5 s). Positions are independent, so they are spread across a pool of single-threaded Stockfish workers (up to 4, one per spare core). A 40-move game usually finishes in 10–30 seconds. |
| Win % | Scores are converted to winning chances with the logistic model Lichess fitted on real games. |
| Classification | Based on **expected points lost** relative to the best move, following Chess.com's published bands: ≤2% Excellent, ≤5% Good, ≤10% Inaccuracy, ≤20% Mistake, >20% Blunder. A +0.5 → −1.0 swing is serious; +9 → +7.5 isn't. In positions that are already decided, small slips drop one band. |
| Best / Great | **Best** means the engine's top move. **Great** means the top move when every alternative is at least a mistake; plain recaptures and grabbing a loose piece don't count. |
| Brilliant | A sound **sacrifice**: the move leaves material the opponent can win by static exchange (legal-move SEE, so pins and checks count), it is still (near-)best, and you were not already completely winning. |
| Miss | You failed to punish your opponent's mistake or blunder, but didn't make things worse than before it. |
| Book | The position appears in the [Lichess openings](https://github.com/lichess-org/chess-openings) dataset, including transpositions. |
| Accuracy | The Lichess accuracy method: per-move accuracy from win % lost, combined as a volatility-weighted mean and a harmonic mean. |

Explanations come from tactical checks on the engine lines: mates allowed or missed, forks, hanging pieces and material swings along the principal variation.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script | |
|---|---|
| `npm run build` / `npm start` | Production build and server |
| `npm run check` | Lint, typecheck and tests |
| `npm test` | Unit tests plus an end-to-end test that runs the real Stockfish build in Node |
| `npm run build:openings [dir]` | Regenerate `public/data/openings.json` from the Lichess openings TSVs (downloads them if no directory is given) |

## Project layout

```
app/                Next.js app router entry, layout and global styles
components/
  App.tsx           Home screen, game search and routing between views
  home/             Game source picker and game list
  review/           Board, eval bar and graph, move list, coach card, engine lines, summary
hooks/
  useGameReview.ts  Runs the engine pool, streams results and caches finished reviews
lib/
  engine/           UCI parsing and the Stockfish worker pool
  analysis/         Classification, explanations, tactics (SEE, forks), accuracy, openings
  games/            Chess.com / Lichess API clients and PGN parsing
public/stockfish/   Stockfish 17.1 lite, single-threaded WASM build
public/data/        Generated opening book
tests/              Vitest suites
```

## Deployment

The app is fully static apart from Next.js itself, so it deploys anywhere Next.js runs (Vercel, Netlify, a Node server). Security headers (CSP, frame and referrer policies) and cache headers for the engine binary are set in `next.config.ts`. The CSP allows outgoing requests only to `api.chess.com` and `lichess.org`.

## Credits and licences

- [Stockfish](https://stockfishchess.org) and [stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3
- [chess.js](https://github.com/jhlywa/chess.js) and [react-chessboard](https://github.com/Clariity/react-chessboard)
- Opening data: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0

Not affiliated with Chess.com or Lichess.
