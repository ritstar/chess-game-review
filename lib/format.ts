import { Chess } from 'chess.js';
import { PIECE_VALUE } from '@/lib/analysis/tactics';

export function formatClock(seconds?: number): string {
  if (seconds === undefined) return '';
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const secText = s < 20 ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${secText}` : `${m}:${secText}`;
}

export function formatDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

const START_COUNTS: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/** Captured pieces per side and the material difference (positive: White ahead). */
export function materialInfo(fen: string) {
  const counts = { w: {} as Record<string, number>, b: {} as Record<string, number> };
  for (const row of new Chess(fen).board()) {
    for (const p of row) if (p) counts[p.color][p.type] = (counts[p.color][p.type] ?? 0) + 1;
  }
  const captured = { w: [] as string[], b: [] as string[] }; // pieces of the *opponent* each side has taken
  let diff = 0;
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    const w = counts.w[t] ?? 0;
    const b = counts.b[t] ?? 0;
    diff += (w - b) * PIECE_VALUE[t as keyof typeof PIECE_VALUE];
    for (let i = 0; i < Math.max(0, START_COUNTS[t] - b); i++) captured.w.push(t);
    for (let i = 0; i < Math.max(0, START_COUNTS[t] - w); i++) captured.b.push(t);
  }
  return { captured, diff };
}

export const PIECE_GLYPH: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

const FIGURINE: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };

/** SAN with piece letters as figurines: "Nf3" → "♘f3", "e8=Q" → "e8=♕". */
export function figurine(san: string): string {
  return san.replace(/^[KQRBN]/, (p) => FIGURINE[p]).replace(/=([QRBN])/, (_, p: string) => `=${FIGURINE[p]}`);
}
