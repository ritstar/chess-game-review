import type { SearchLimits } from '@/lib/engine/stockfish';

export type AnalysisDepth = 'fast' | 'standard' | 'deep';

export const DEPTH_PRESETS: Record<AnalysisDepth, SearchLimits & { label: string; hint: string }> = {
  fast: { depth: 12, moveTimeMs: 600, multiPv: 3, label: 'Fast', hint: 'Depth 12 · quick overview' },
  standard: { depth: 16, moveTimeMs: 1500, multiPv: 3, label: 'Standard', hint: 'Depth 16 · recommended' },
  deep: { depth: 20, moveTimeMs: 4000, multiPv: 3, label: 'Deep', hint: 'Depth 20 · slower, most accurate' },
};

export type BoardTheme = 'green' | 'brown' | 'blue' | 'gray';

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; label: string }> = {
  green: { light: '#ebecd0', dark: '#739552', label: 'Green' },
  brown: { light: '#f0d9b5', dark: '#b58863', label: 'Brown' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', label: 'Blue' },
  gray: { light: '#e0e0e0', dark: '#8f8f8f', label: 'Gray' },
};

export interface Settings {
  depth: AnalysisDepth;
  boardTheme: BoardTheme;
  showBestArrow: boolean;
  showEngineLines: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  depth: 'standard',
  boardTheme: 'green',
  showBestArrow: true,
  showEngineLines: true,
};

/** Bump when classification logic changes so stale cached reviews are ignored. */
export const ANALYSIS_VERSION = 2;

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
