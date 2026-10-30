import type { SearchLimits } from '@/lib/engine/stockfish';

export type AnalysisDepth = 'fast' | 'standard' | 'deep';

export interface AnalysisPreset {
  label: string;
  hint: string;
  /** First pass: every position. */
  search: SearchLimits;
  /** Second pass: the moments that decide the review, searched again deeper. */
  deep: SearchLimits;
  /** At most this many moves get the deeper second look. */
  deepMoves: number;
}

export const DEPTH_PRESETS: Record<AnalysisDepth, AnalysisPreset> = {
  fast: {
    label: 'Fast',
    hint: 'Depth 12, key moves checked at 16 · quick overview',
    search: { depth: 12, nodes: 300_000, moveTimeMs: 4000, multiPv: 3 },
    deep: { depth: 16, nodes: 800_000, moveTimeMs: 8000, multiPv: 3 },
    deepMoves: 8,
  },
  standard: {
    label: 'Standard',
    hint: 'Depth 16, key moves checked at 20 · recommended',
    search: { depth: 16, nodes: 800_000, moveTimeMs: 8000, multiPv: 3 },
    deep: { depth: 20, nodes: 1_500_000, moveTimeMs: 12000, multiPv: 3 },
    deepMoves: 14,
  },
  deep: {
    label: 'Deep',
    hint: 'Depth 20, key moves checked at 24 · slower, strongest',
    search: { depth: 20, nodes: 2_000_000, moveTimeMs: 15000, multiPv: 3 },
    deep: { depth: 24, nodes: 6_000_000, moveTimeMs: 40000, multiPv: 3 },
    deepMoves: 24,
  },
};

export type BoardTheme = 'green' | 'wood' | 'brown' | 'blue' | 'gray';

/** Subtle grain for the wood board, drawn with gradients instead of an image. */
const GRAIN =
  'repeating-linear-gradient(97deg, rgba(255,255,255,.06) 0 1px, transparent 1px 4px, rgba(0,0,0,.05) 4px 5px, transparent 5px 9px), linear-gradient(170deg, rgba(255,255,255,.08), rgba(0,0,0,.06))';

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; label: string; texture?: string }> = {
  green: { light: '#ebecd0', dark: '#739552', label: 'Green' },
  wood: { light: '#e6c79c', dark: '#ae7c4e', label: 'Wood', texture: GRAIN },
  brown: { light: '#f0d9b5', dark: '#b58863', label: 'Brown' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', label: 'Blue' },
  gray: { light: '#e0e0e0', dark: '#8f8f8f', label: 'Gray' },
};

export interface Settings {
  depth: AnalysisDepth;
  boardTheme: BoardTheme;
  showBestArrow: boolean;
  showEngineLines: boolean;
  sound: boolean;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  depth: 'standard',
  boardTheme: 'green',
  showBestArrow: true,
  showEngineLines: true,
  sound: true,
  haptics: true,
};

/** Bump when classification logic changes so stale cached reviews are ignored. */
export const ANALYSIS_VERSION = 3;

const KEY = 'chess-review:settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
