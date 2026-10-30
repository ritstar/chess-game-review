import { spawn } from 'node:child_process';
import { StockfishEngine, type UciTransport } from '@/lib/engine/stockfish';

/** Runs the same Stockfish build the browser uses, as a Node child process. */
export function nodeTransport(): UciTransport {
  const proc = spawn(process.execPath, ['public/stockfish/stockfish.js']);
  const listeners: ((line: string) => void)[] = [];
  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const l of lines) listeners.forEach((fn) => fn(l.trim()));
  });
  return {
    post: (command) => proc.stdin.write(`${command}\n`),
    onLine: (fn) => listeners.push(fn),
    onError: (fn) => proc.on('error', fn),
    terminate: () => proc.kill(),
  };
}

export const nodeEngine = () => new StockfishEngine(nodeTransport());
