import { spawn } from 'node:child_process';
import { parseInfoLine, type EngineLine, type PositionAnalysis } from '@/lib/engine/uci';

/** Runs the same Stockfish build the browser uses, as a Node child process. */
export class NodeEngine {
  private proc = spawn(process.execPath, ['public/stockfish/stockfish.js']);
  private buffer = '';
  private onLine: ((line: string) => void) | null = null;

  constructor(multiPv = 3) {
    this.proc.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      lines.forEach((l) => this.onLine?.(l.trim()));
    });
    this.proc.stdin.write(`uci\nsetoption name MultiPV value ${multiPv}\n`);
  }

  analyse(fen: string, depth: number): Promise<PositionAnalysis> {
    return new Promise((resolve) => {
      const lines = new Map<number, EngineLine>();
      this.onLine = (l) => {
        const parsed = parseInfoLine(l);
        if (parsed) lines.set(parsed.rank, parsed);
        if (l.startsWith('bestmove')) {
          const sorted = [...lines.values()].sort((a, b) => a.rank - b.rank);
          resolve({ fen, depth: sorted[0]?.depth ?? 0, lines: sorted });
        }
      };
      this.proc.stdin.write(`position fen ${fen}\ngo depth ${depth}\n`);
    });
  }

  quit() {
    this.proc.kill();
  }
}
