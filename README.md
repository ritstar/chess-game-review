# ♟ Chess.com Game Review — Local Replica

A pixel-perfect replica of **Chess.com's Game Review** feature, running entirely in your browser with a local Stockfish engine. Analyze any Chess.com player's games with move-by-move classifications, best-move arrows, and an interactive board.

## Features

- **Chess.com-style move classifications** — Brilliant `!!`, Great `!`, Best `★`, Excellent, Good, Inaccuracy `?!`, Mistake `?`, Blunder `??`, Book `📖`, Forced
- **Two-pass Stockfish analysis** — Evaluates every position at depth 18, then classifies with full context
- **Interactive chessboard** — Highlights played move squares with classification colors, shows best-move arrows when you deviate from the engine's top choice
- **Paired move panel** — Displays moves as `1. e4 e5` with classification dots and move descriptions ("Best move ★", "Inaccuracy. Nf3 was best.")
- **Evaluation bar** — Smooth animated bar showing White/Black advantage
- **Player info bars** — Username, rating, and piece color above/below the board
- **Classification summary** — Counts for each classification type after analysis
- **Keyboard navigation** — Arrow keys, Home/End to navigate through moves

## Classification Criteria

| Type | Symbol | Criteria |
|---|---|---|
| Brilliant | `!!` | Sacrifices material (≥2 pts net), is the best move, position not already winning |
| Great | `!` | Best move where second-best is 150+ cp worse |
| Best | `★` | Matches engine's top move |
| Excellent | `✓` | CPL ≤ 10, not the engine's first choice |
| Good | `+` | CPL 11–30 |
| Inaccuracy | `?!` | CPL 31–100 or win-chance loss > 10% |
| Mistake | `?` | CPL 101–250 or win-chance loss > 20% |
| Blunder | `??` | CPL > 250 or win-chance loss > 30% |
| Book | `📖` | Opening theory (first 8–12 ply) |
| Forced | `—` | Only one legal move available |

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + TypeScript
- **Stockfish 17** (WASM, runs in a Web Worker)
- **chess.js** for move parsing and validation
- **react-chessboard** for the interactive board
- **Tailwind CSS 4** for styling

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone <repo-url>
cd Chess_Com_Game_Analysis
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Usage

1. Enter a **Chess.com username** in the top bar and click **Load Games**
2. Select a game from the left sidebar
3. Click **▶ Run Analysis** to start Stockfish evaluation
4. Navigate moves with the **◀ ▶** buttons or **arrow keys**
5. View classification icons, best-move arrows, and move descriptions

## Project Structure

```
├── app/
│   ├── page.tsx            # Main layout (sidebar + eval bar + board + move panel)
│   ├── layout.tsx          # Root layout with metadata
│   └── globals.css         # Chess.com dark theme + classification colors
├── components/
│   ├── ChessBoardArea.tsx  # Board with highlights, arrows, badges, navigation
│   ├── MovePanel.tsx       # Paired moves, classification dots, move descriptions
│   ├── EvaluationBar.tsx   # Animated eval bar
│   └── GameList.tsx        # Sidebar game list with results
├── hooks/
│   └── useStockfish.ts     # Two-pass analysis hook (evaluate → classify)
├── lib/
│   ├── analysis.ts         # Move classification engine (CPL + win-chance)
│   ├── stockfish.ts        # Stockfish WASM worker with MultiPV support
│   ├── chess-api.ts        # Chess.com public API client
│   └── utils.ts            # Tailwind merge utility
└── public/
    └── stockfish/          # Stockfish WASM + JS files
```

## License

MIT
