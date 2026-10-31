/**
 * Haptic feedback. Android browsers support the Vibration API. iOS Safari
 * doesn't, but toggling a native `<input type="checkbox" switch>` (iOS 18+)
 * produces a system haptic tick; that's unofficial and may stop working, so
 * it's used only as a fallback. The iOS tick only fires while the browser is
 * still handling the user's tap, so on iPhone call {@link haptic} from the
 * event handler itself, not from an effect or timer (see
 * {@link hapticNeedsGesture}).
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

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export type IosTickMethod = 'head' | 'body';

/**
 * Toggle a throwaway native switch. 'head': hidden label in <head> (the
 * well-known trick). 'body': a rendered but invisible label in <body>, for
 * iOS versions that only react to switches that are actually laid out.
 */
export function iosTick(method: IosTickMethod = 'head') {
  try {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    if (method === 'head') label.style.display = 'none';
    else label.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;overflow:hidden;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    (method === 'head' ? document.head : document.body).appendChild(label);
    label.click();
    label.remove();
  } catch {
    // ignore
  }
}

/** iOS version from the user agent, e.g. "18.1"; null elsewhere. */
export function iosVersion(): string | null {
  if (typeof navigator === 'undefined') return null;
  const m = navigator.userAgent.match(/OS (\d+)[._](\d+)/);
  return isIOS() && m ? `${m[1]}.${m[2]}` : null;
}

/** True where haptics only work synchronously inside a tap/click handler (iPhone, iPad). */
export function hapticNeedsGesture(): boolean {
  return typeof navigator !== 'undefined' && !('vibrate' in navigator) && isIOS();
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
  // One tick: iOS ignores a second one fired after the tap has been handled.
  if (isIOS()) iosTick();
}

export function hapticForSan(san: string): HapticKind {
  if (san.includes('+') || san.includes('#')) return 'check';
  if (san.includes('x')) return 'capture';
  return 'move';
}
