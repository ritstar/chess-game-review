export interface Evaluation {
  cp?: number;
  mate?: number;
  depth: number;
  nodes?: number;
  bestMove?: string;
  pv?: string; // principal variation line
}

export interface MultiPvResult {
  pv1: Evaluation;
  pv2: Evaluation | null;
}

interface AnalyzeOptions {
  depth?: number;
  moveTimeMs?: number;
  timeoutMs?: number;
  multiPv?: number; // 1 or 2
}

interface PendingAnalysis {
  resolve: (value: Evaluation[]) => void;
  reject: (reason?: unknown) => void;
  results: Map<number, Evaluation>; // pvIndex -> best eval
  multiPv: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;
  private ready = false;
  private pending: PendingAnalysis | null = null;

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    if (typeof window === 'undefined') return;

    this.worker = new Worker('/stockfish/stockfish.js');
    this.worker.onmessage = this.handleMessage;
    this.worker.onerror = (error) => {
      if (this.pending) {
        clearTimeout(this.pending.timeoutId);
        this.pending.reject(error);
        this.pending = null;
      }
    };

    this.worker.postMessage('uci');
  }

  private handleMessage = (event: MessageEvent<string>) => {
    const line = String(event.data || '');

    if (line === 'uciok') {
      this.worker?.postMessage('setoption name Hash value 32');
      this.worker?.postMessage('isready');
      return;
    }

    if (line === 'readyok') {
      this.ready = true;
      this.resolveReady?.();
      this.resolveReady = null;
      return;
    }

    if (line.startsWith('info ') && this.pending) {
      const parsed = this.parseInfoLine(line);
      if (parsed) {
        const pvIdx = parsed.pvIndex ?? 1;
        const existing = this.pending.results.get(pvIdx);
        if (!existing || parsed.eval.depth >= existing.depth) {
          this.pending.results.set(pvIdx, parsed.eval);
        }
      }
      return;
    }

    if (line.startsWith('bestmove') && this.pending) {
      const move = line.split(' ')[1];
      const results: Evaluation[] = [];

      for (let i = 1; i <= this.pending.multiPv; i++) {
        const ev = this.pending.results.get(i) ?? { depth: 0 };
        if (i === 1 && move && move !== '(none)') {
          ev.bestMove = ev.bestMove || move;
        }
        results.push(ev);
      }

      clearTimeout(this.pending.timeoutId);
      this.pending.resolve(results);
      this.pending = null;
    }
  };

  private parseInfoLine(line: string): { eval: Evaluation; pvIndex?: number } | null {
    const depthMatch = /\bdepth\s+(\d+)/.exec(line);
    if (!depthMatch) return null;

    // Skip seldepth-only lines and upperbound/lowerbound
    if (/\b(upperbound|lowerbound)\b/.test(line)) return null;

    const cpMatch = /\bscore\s+cp\s+(-?\d+)/.exec(line);
    const mateMatch = /\bscore\s+mate\s+(-?\d+)/.exec(line);
    const nodesMatch = /\bnodes\s+(\d+)/.exec(line);
    const pvMatch = /\bpv\s+(.+)$/.exec(line);
    const multipvMatch = /\bmultipv\s+(\d+)/.exec(line);

    const evaluation: Evaluation = {
      depth: parseInt(depthMatch[1], 10),
    };

    if (cpMatch) evaluation.cp = parseInt(cpMatch[1], 10);
    if (mateMatch) evaluation.mate = parseInt(mateMatch[1], 10);
    if (nodesMatch) evaluation.nodes = parseInt(nodesMatch[1], 10);

    if (pvMatch) {
      const pvMoves = pvMatch[1].trim().split(/\s+/);
      if (pvMoves[0] && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(pvMoves[0])) {
        evaluation.bestMove = pvMoves[0];
      }
      evaluation.pv = pvMatch[1].trim();
    }

    const pvIndex = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;

    return { eval: evaluation, pvIndex };
  }

  /**
   * Analyze a position. Returns an array of evaluations (one per PV line).
   * For multiPv=1, returns [eval]. For multiPv=2, returns [pv1eval, pv2eval].
   */
  public async analyzePosition(fen: string, options: AnalyzeOptions = {}): Promise<Evaluation[]> {
    if (!this.worker) {
      throw new Error('Stockfish worker unavailable.');
    }

    const depth = options.depth ?? 18;
    const timeoutMs = options.timeoutMs ?? 8000;
    const moveTimeMs = options.moveTimeMs;
    const multiPv = options.multiPv ?? 1;

    await this.readyPromise;

    if (!this.ready) {
      throw new Error('Stockfish is not ready.');
    }

    this.stop();

    if (this.pending) {
      clearTimeout(this.pending.timeoutId);
      this.pending.reject(new Error('Cancelled by a new analysis request.'));
      this.pending = null;
    }

    return new Promise<Evaluation[]>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending) return;
        this.stop();
        const results: Evaluation[] = [];
        for (let i = 1; i <= multiPv; i++) {
          results.push(this.pending!.results.get(i) ?? { depth: 0 });
        }
        this.pending = null;

        if (results[0] && (results[0].cp !== undefined || results[0].mate !== undefined)) {
          resolve(results);
          return;
        }
        reject(new Error('Stockfish timed out without an evaluation.'));
      }, timeoutMs);

      this.pending = {
        resolve,
        reject,
        results: new Map(),
        multiPv,
        timeoutId,
      };

      this.worker?.postMessage(`setoption name MultiPV value ${multiPv}`);
      this.worker?.postMessage(`position fen ${fen}`);
      this.worker?.postMessage(moveTimeMs ? `go movetime ${moveTimeMs}` : `go depth ${depth}`);
    });
  }

  public stop() {
    this.worker?.postMessage('stop');
  }

  public quit() {
    if (this.pending) {
      clearTimeout(this.pending.timeoutId);
      this.pending.reject(new Error('Engine terminated.'));
      this.pending = null;
    }

    this.worker?.postMessage('quit');
    this.worker?.terminate();
    this.worker = null;
  }
}
