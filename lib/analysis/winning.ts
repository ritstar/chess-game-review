/**
 * Win-probability and accuracy maths.
 *
 * Win% uses the logistic model fitted by Lichess on real games
 * (https://lichess.org/page/accuracy). Accuracy follows the same published
 * method: per-move accuracy from win% lost, aggregated with a mix of a
 * volatility-weighted mean and a harmonic mean so one blunder in a sharp
 * position counts more than drift in a dead-equal one.
 */

const K = 0.00368208;

/** Win probability for the side the score belongs to, 0–100. */
export function winPercent(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-K * clamped)) - 1);
}

/** Accuracy of a single move given win% (mover's POV) before and after. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const loss = Math.max(0, winBefore - winAfter);
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1)); // +1 "uncertainty bonus", as Lichess does
}

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

function harmonicMean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.length / xs.reduce((a, x) => a + 1 / Math.max(x, 1e-3), 0);
}

/**
 * Game accuracy for one player.
 *
 * @param whiteWin win% from White's POV for every position: index 0 is the
 *   start position, index i is after ply i. Length = plies + 1.
 * @param color which player to score.
 * @param firstMover who moved at ply 1 ('w' unless the game starts from a FEN).
 */
export function gameAccuracy(whiteWin: number[], color: 'w' | 'b', firstMover: 'w' | 'b' = 'w'): number | null {
  const n = whiteWin.length - 1;
  if (n < 1) return null;

  const windowSize = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < Math.min(windowSize, whiteWin.length) - 2; i++) windows.push(whiteWin.slice(0, windowSize));
  for (let i = 0; i + windowSize <= whiteWin.length; i++) windows.push(whiteWin.slice(i, i + windowSize));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));

  const accs: { acc: number; weight: number }[] = [];
  for (let ply = 1; ply <= n; ply++) {
    const mover = (ply % 2 === 1) === (firstMover === 'w') ? 'w' : 'b';
    if (mover !== color) continue;
    const sign = color === 'w' ? 1 : -1;
    const before = sign === 1 ? whiteWin[ply - 1] : 100 - whiteWin[ply - 1];
    const after = sign === 1 ? whiteWin[ply] : 100 - whiteWin[ply];
    accs.push({ acc: moveAccuracy(before, after), weight: weights[Math.min(ply - 1, weights.length - 1)] ?? 1 });
  }
  if (accs.length === 0) return null;

  const totalWeight = accs.reduce((a, x) => a + x.weight, 0);
  const weighted = accs.reduce((a, x) => a + x.acc * x.weight, 0) / totalWeight;
  const harmonic = harmonicMean(accs.map((x) => x.acc));
  return (weighted + harmonic) / 2;
}
