/**
 * Haptic feedback. Android browsers support the Vibration API. iOS Safari
 * doesn't, but toggling a native `<input type="checkbox" switch>` (iOS 18+)
 * produces a system haptic tick; that's unofficial and may stop working, so
 * it's used only as a fallback.
 */

export type HapticKind = 'move' | 'capture' | 'check' | 'illegal' | 'success' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  move: 12,
  capture: 28,
  check: [18, 60, 18],
  illegal: [35, 40, 35],
  success: [12, 70, 24],
  error: 70,
};

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function iosTick() {
  try {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    // ignore
  }
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && ('vibrate' in navigator || isIOS());
}

export function haptic(kind: HapticKind) {
  if (typeof navigator === 'undefined') return;
  const pattern = PATTERNS[kind];
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
    return;
  }
  if (isIOS()) {
    iosTick();
    // A second tick for "double" patterns; only fires if Safari still treats
    // us as inside the user gesture.
    if (Array.isArray(pattern)) setTimeout(iosTick, 90);
  }
}

export function hapticForSan(san: string): HapticKind {
  if (san.includes('+') || san.includes('#')) return 'check';
  if (san.includes('x')) return 'capture';
  return 'move';
}
