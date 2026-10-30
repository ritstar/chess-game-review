import { EngineLine, PositionAnalysis, parseInfoLine } from './uci';

export interface SearchLimits {
  depth: number;
  /**
   * Node budget. Together with a cleared hash this makes a search fully
   * deterministic: the same game gets the same review on every device, only
   * faster or slower.
   */
  nodes: number;
  /** Safety cap per search so very slow devices still finish. */
  moveTimeMs: number;
  multiPv: number;
}

/** One position to analyse, optionally with the move that was played from it. */
export interface SearchJob {
  fen: string;
  limits: SearchLimits;
  /** UCI move to score in the same search when it isn't among the top lines. */
  played?: string;
}

/** Line-based connection to a UCI engine: a Web Worker in the browser, a child process in Node. */
export interface UciTransport {
  post(command: string): void;
  onLine(listener: (line: string) => void): void;
  onError(listener: (error: Error) => void): void;
  terminate(): void;
}

interface Job {
  fen: string;
  limits: SearchLimits;
  lines: Map<number, EngineLine>;
  resolve: (value: PositionAnalysis) => void;
  reject: (reason: Error) => void;
  timers: ReturnType<typeof setTimeout>[];
  onUpdate?: (partial: PositionAnalysis) => void;
}

const ENGINE_URL = '/stockfish/stockfish.js';
const WASM_URL = '/stockfish/stockfish.wasm';

let wasmPromise: Promise<unknown> | null = null;

/**
 * Download the engine binary (~7 MB) into the HTTP cache once. Workers
 * started together would otherwise each fetch it before the cache fills,
 * which costs real money on mobile data. Safe to call early (e.g. while the
 * user browses their games) to make the first review start sooner.
 */
export function prefetchEngine(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.resolve();
  wasmPromise ??= fetch(WASM_URL)
    .then((r) => r.arrayBuffer())
    .catch(() => {
      wasmPromise = null;
    });
  return wasmPromise;
}

function workerTransport(): UciTransport {
  const worker = new Worker(ENGINE_URL);
  return {
    post: (command) => worker.postMessage(command),
    onLine: (listener) => worker.addEventListener('message', (e: MessageEvent) => listener(String(e.data ?? ''))),
    onError: (listener) =>
      worker.addEventListener('error', () => listener(new Error('Failed to load the Stockfish engine.')), { once: true }),
    terminate: () => worker.terminate(),
  };
}

export class AbortError extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'AbortError';
  }
}

/**
 * A single Stockfish instance. Handles one search at a time; use
 * {@link EnginePool} to analyse several positions in parallel.
 */
export class StockfishEngine {
  private transport: UciTransport;
  private ready: Promise<void>;
  private job: Job | null = null;
  private multiPv = 0;
  /** Set while a cancelled search winds down; its late `bestmove` must not leak into the next job. */
  private stopping: Promise<void> | null = null;
  private onStopped: (() => void) | null = null;
  private booted = false;

  constructor(transport: UciTransport = workerTransport(), hashMb = 16) {
    this.transport = transport;
    this.ready = new Promise((resolve, reject) => {
      transport.onLine((line) => {
        if (this.booted) return this.onMessage(line);
        if (line === 'uciok') {
          transport.post(`setoption name Hash value ${hashMb}`);
          transport.post('isready');
        } else if (line === 'readyok') {
          this.booted = true;
          resolve();
        }
      });
      transport.onError(reject);
    });
    transport.post('uci');
  }

  private onMessage(line: string) {
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
        if (!prev || parsed.depth >= prev.depth) {
          job.lines.set(parsed.rank, parsed);
          job.onUpdate?.(this.collect(job));
        }
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      job.timers.forEach(clearTimeout);
      this.job = null;
      job.resolve(this.collect(job));
    }
  }

  private collect(job: Job): PositionAnalysis {
    // Lines from an unfinished iteration can be shallower than the others;
    // keep them, but report the depth every line reached.
    const lines = [...job.lines.values()].sort((a, b) => a.rank - b.rank);
    const depth = lines[0]?.depth ?? 0;
    return { fen: job.fen, depth, lines };
  }

  /**
   * Search a position. `onUpdate` receives the lines found so far every time
   * the engine reports progress, for live displays. `fresh` clears the hash
   * first so the result doesn't depend on what this engine searched before;
   * `searchMoves` restricts the search to those moves.
   */
  async analyse(
    fen: string,
    limits: SearchLimits,
    onUpdate?: (partial: PositionAnalysis) => void,
    options: { fresh?: boolean; searchMoves?: string[] } = {},
  ): Promise<PositionAnalysis> {
    await this.ready;
    if (this.stopping) await this.stopping;
    if (this.job) throw new Error('Engine is busy');

    if (this.multiPv !== limits.multiPv) {
      this.transport.post(`setoption name MultiPV value ${limits.multiPv}`);
      this.multiPv = limits.multiPv;
    }
    if (options.fresh) this.transport.post('ucinewgame');

    return new Promise<PositionAnalysis>((resolve, reject) => {
      const job: Job = { fen, limits, lines: new Map(), resolve, reject, timers: [], onUpdate };
      job.timers.push(
        // Out of time: stop and take what the search has (bestmove resolves the job).
        setTimeout(() => this.job === job && this.transport.post('stop'), limits.moveTimeMs),
        // A wedged worker never answers; give up on it.
        setTimeout(() => {
          if (this.job !== job) return;
          this.job = null;
          this.halt();
          const result = this.collect(job);
          if (result.lines.length) resolve(result);
          else reject(new Error('Engine did not respond.'));
        }, limits.moveTimeMs + 5000),
      );
      this.job = job;
      this.transport.post(`position fen ${fen}`);
      // `searchmoves` takes every remaining token, so it must come last.
      const restrict = options.searchMoves?.length ? ` searchmoves ${options.searchMoves.join(' ')}` : '';
      this.transport.post(`go depth ${limits.depth} nodes ${limits.nodes}${restrict}`);
    });
  }

  /**
   * Analyse a position for the game review: a fresh, deterministic MultiPV
   * search, plus the played move scored on its own when the engine didn't
   * consider it one of the best.
   */
  async run(job: SearchJob): Promise<PositionAnalysis> {
    const result = await this.analyse(job.fen, job.limits, undefined, { fresh: true });
    if (job.played && result.lines.length && !result.lines.some((l) => l.pv[0] === job.played)) {
      const own = await this.analyse(job.fen, { ...job.limits, multiPv: 1 }, undefined, { searchMoves: [job.played] });
      const line = own.lines[0];
      if (line?.pv[0] === job.played) result.played = { ...line, rank: 0 };
    }
    return result;
  }

  /** Abort the current search. The pending promise rejects with {@link AbortError}. */
  cancel() {
    if (!this.job) return;
    this.job.timers.forEach(clearTimeout);
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
    this.transport.post('stop');
  }

  terminate() {
    this.cancel();
    this.transport.terminate();
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

  constructor(
    private size = defaultPoolSize(),
    private create: () => StockfishEngine = () => new StockfishEngine(),
  ) {}

  private async ensure() {
    if (this.engines.length >= this.size) return;
    await prefetchEngine();
    while (this.engines.length < this.size) this.engines.push(this.create());
  }

  /**
   * Run every job. `onResult` fires as each one completes (out of order).
   * Resolves with results in input order.
   */
  async analyseAll(
    jobs: SearchJob[],
    onResult: (index: number, result: PositionAnalysis) => void,
    signal?: AbortSignal,
  ): Promise<PositionAnalysis[]> {
    await this.ensure();
    if (signal?.aborted) throw new AbortError();
    const results: PositionAnalysis[] = new Array(jobs.length);
    let next = 0;

    let stopped = false;
    const stopAll = () => {
      stopped = true;
      this.engines.forEach((e) => e.cancel());
    };
    signal?.addEventListener('abort', stopAll, { once: true });

    const run = async (engine: StockfishEngine) => {
      while (next < jobs.length && !stopped) {
        const i = next++;
        const result = await engine.run(jobs[i]);
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
