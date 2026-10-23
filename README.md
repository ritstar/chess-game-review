# ♟ Game Review

Free, private game review for **Chess.com** and **Lichess** games, powered by **Stockfish 17** running entirely in your browser.

Load your games by username (or paste a PGN / Lichess link) and get:

- **Move classifications**: Brilliant `!!`, Great `!`, Best, Excellent, Good, Book, Forced, Inaccuracy `?!`, Mistake `?`, Miss, Blunder `??`
- **Explanations in plain English**: "Allows a fork: Ne3 attacks your queen on d1 and rook on f1", "Missed mate in 2: …", "This leaves the bishop on f6 undefended", with the best line and the opponent's refutation
- **Accuracy** for both players, plus average centipawn loss
- **Evaluation graph** with the key moments marked; click or drag it to jump around
- **Explore your own moves**: drag a piece or tap a piece and then a square, at any point in the review. A live Stockfish instance rates the move you tried (Best, Inaccuracy, Blunder and so on) and explains it. Lines appear in the move list, and **Back to game** (or Esc) returns you to exactly where you left the game. Undo takes back one move.
- **Chess.com-style review flow**: a coach speech bubble, a horizontal eval bar on phones, a swipeable move strip, and a bottom bar with **Retry** (find a better move than your mistake), **Show** (play out the engine's follow-up), **Best** (see the best move instead) and **Next**
- **Sound and haptics**: distinct sounds for moves, captures, checks, castling, promotion and illegal moves (generated in code, no audio files). Vibration works on Android; recent iPhones get a light tap through an unofficial Safari workaround. Both can be switched off in settings.
- **Engine lines**: top 3 Stockfish lines for every position (hover one to see it on the board, click it to play it)
- **Opening names** from a 3,800-line opening book; theory moves are marked as Book
- Clocks, captured material, best-move and threat arrows, autoplay, five board themes (including wood) and keyboard navigation (← → Home End, F to flip, Space to autoplay, Esc to return to the game, Backspace to undo)
- Shareable URLs (`?src=chesscom&u=<user>&g=<game>`). Finished reviews are cached in IndexedDB, so reopening a game is instant.

## Built for phones

Most reviews happen on a phone, so the phone layout is the primary design:

- **Everything on one screen.** The review is a full-screen view that never scrolls: header, eval bar, a two-line coach, the board (sized to whatever height is left, so it's full width on most phones), the move strip and a thumb-reach action bar. Player bars appear when the screen is tall enough. Landscape puts the board beside the controls.
- **Details on demand.** Tap the coach for the full explanation, the best line and the engine lines (tap a line to play it). Settings, flip, copy PGN and the summary live in the ⋯ menu. Both open as bottom sheets.
- **Straight to your games.** The last player you looked up loads automatically; games you've reviewed show your accuracy in the list.
- **Installable.** Add it to your home screen (Share → Add to Home Screen on iPhone, Install app on Android) and it opens full-screen like an app, with no browser toolbars.
- Fast: a step paints in well under a frame's budget on a mid-range phone. No pull-to-refresh while reviewing, no zoom on input focus, and the notch and home indicator are respected.

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
  useExplorer.ts    Live engine and ratings for moves tried on the board
lib/
  engine/           UCI parsing and the Stockfish worker pool
  analysis/         Classification, explanations, tactics (SEE, forks), accuracy, openings
  games/            Chess.com / Lichess API clients and PGN parsing
  review/           Board navigation state (game moves and explored lines)
  sound.ts, haptics.ts  Board feedback
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
