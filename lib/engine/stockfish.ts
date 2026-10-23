import { EngineLine, PositionAnalysis, parseInfoLine } from './uci';

export interface SearchLimits {
  depth: number;
  /** Hard cap per position so slow devices still finish. */
  moveTimeMs: number;
  multiPv: number;
}

interface Job {
  fen: string;
  limits: SearchLimits;
  lines: Map<number, EngineLine>;
  resolve: (value: PositionAnalysis) => void;
  reject: (reason: Error) => void;
  watchdog: ReturnType<typeof setTimeout>;
}

const ENGINE_URL = '/stockfish/stockfish.js';

export class AbortError extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'AbortError';
  }
}

/**
 * A single Stockfish instance running in a Web Worker. Handles one search at
 * a time; use {@link EnginePool} to analyse several positions in parallel.
 */
export class StockfishEngine {
  private worker: Worker;
  private ready: Promise<void>;
  private job: Job | null = null;
  private multiPv = 0;
  /** Set while a cancelled search winds down; its late `bestmove` must not leak into the next job. */
  private stopping: Promise<void> | null = null;
  private onStopped: (() => void) | null = null;

  constructor(hashMb = 32) {
    this.worker = new Worker(ENGINE_URL);
    this.ready = new Promise((resolve, reject) => {
      const onBoot = (e: MessageEvent) => {
        const line = String(e.data ?? '');
        if (line === 'uciok') {
          this.worker.postMessage(`setoption name Hash value ${hashMb}`);
          this.worker.postMessage('isready');
        } else if (line === 'readyok') {
          this.worker.removeEventListener('message', onBoot);
          resolve();
        }
      };
      this.worker.addEventListener('message', onBoot);
      this.worker.addEventListener('error', () => reject(new Error('Failed to load the Stockfish engine.')), {
        once: true,
      });
    });
    this.worker.addEventListener('message', this.onMessage);
    this.worker.postMessage('uci');
  }

  private onMessage = (e: MessageEvent) => {
    const line = String(e.data ?? '');
    if (this.onStopped && line.startsWith('bestmove')) {
      this.onStopped();
      this.onStopped = null;
      this.stopping = null;
      return;
    }
    const job = this.job;
    if (!job) return;

    if (line.startsWith('info ')) {
      const parsed = parseInfoLine(line);
      if (parsed && parsed.rank <= job.limits.multiPv) {
        const prev = job.lines.get(parsed.rank);
        if (!prev || parsed.depth >= prev.depth) job.lines.set(parsed.rank, parsed);
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      clearTimeout(job.watchdog);
      this.job = null;
      job.resolve(this.collect(job));
    }
  };

  private collect(job: Job): PositionAnalysis {
    const lines = [...job.lines.values()].sort((a, b) => a.rank - b.rank);
    const depth = lines[0]?.depth ?? 0;
    return { fen: job.fen, depth, lines };
  }

  async analyse(fen: string, limits: SearchLimits): Promise<PositionAnalysis> {
    await this.ready;
    if (this.stopping) await this.stopping;
    if (this.job) throw new Error('Engine is busy');

    if (this.multiPv !== limits.multiPv) {
      this.worker.postMessage(`setoption name MultiPV value ${limits.multiPv}`);
      this.multiPv = limits.multiPv;
    }

    return new Promise<PositionAnalysis>((resolve, reject) => {
      // Stockfish honours movetime itself; the watchdog only guards against a
      // wedged worker.
      const watchdog = setTimeout(() => {
        if (this.job !== job) return;
        this.job = null;
        this.halt();
        const result = this.collect(job);
        if (result.lines.length) resolve(result);
        else reject(new Error('Engine did not respond.'));
      }, limits.moveTimeMs + 5000);

      const job: Job = { fen, limits, lines: new Map(), resolve, reject, watchdog };
      this.job = job;
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${limits.depth} movetime ${limits.moveTimeMs}`);
    });
  }

  /** Abort the current search. The pending promise rejects with {@link AbortError}. */
  cancel() {
    if (!this.job) return;
    clearTimeout(this.job.watchdog);
    this.job.reject(new AbortError());
    this.job = null;
    this.halt();
  }

  private halt() {
    const stopping: Promise<void> = new Promise((resolve) => {
      this.onStopped = resolve;
      // Never wait forever on a wedged worker.
      setTimeout(() => {
        if (this.stopping !== stopping) return;
        this.stopping = null;
        this.onStopped = null;
        resolve();
      }, 2000);
    });
    this.stopping = stopping;
    this.worker.postMessage('stop');
  }

  terminate() {
    this.cancel();
    this.worker.terminate();
  }
}

/** Number of parallel engines to run, leaving a core free for the UI. */
export function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

/**
 * A pool of single-threaded engines. Positions in a game are independent, so
 * spreading them across workers scales almost linearly with cores.
 */
export class EnginePool {
  private engines: StockfishEngine[] = [];

  constructor(private size = defaultPoolSize()) {}

  private ensure() {
    while (this.engines.length < this.size) this.engines.push(new StockfishEngine());
  }

  /**
   * Analyse every FEN. `onResult` fires as each position completes (out of
   * order). Resolves with results in input order.
   */
  async analyseAll(
    fens: string[],
    limits: SearchLimits,
    onResult: (index: number, result: PositionAnalysis) => void,
    signal?: AbortSignal,
  ): Promise<PositionAnalysis[]> {
    this.ensure();
    const results: PositionAnalysis[] = new Array(fens.length);
    let next = 0;

    let stopped = false;
    const stopAll = () => {
      stopped = true;
      this.engines.forEach((e) => e.cancel());
    };
    signal?.addEventListener('abort', stopAll, { once: true });

    const run = async (engine: StockfishEngine) => {
      while (next < fens.length && !stopped) {
        const i = next++;
        const result = await engine.analyse(fens[i], limits);
        if (stopped) return;
        results[i] = result;
        onResult(i, result);
      }
    };

    try {
      // One failing engine stops the rest so we don't keep burning CPU.
      await Promise.all(this.engines.map((e) => run(e).catch((err) => (stopAll(), Promise.reject(err)))));
    } finally {
      signal?.removeEventListener('abort', stopAll);
    }
    if (signal?.aborted) throw new AbortError();
    return results;
  }

  terminate() {
    this.engines.forEach((e) => e.terminate());
    this.engines = [];
  }
}
