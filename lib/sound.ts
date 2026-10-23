/**
 * Board sounds, synthesised with the Web Audio API so there are no audio
 * files to download or license. Each sound is a short wooden "tock" (filtered
 * noise burst plus a low thump), varied per event.
 */

export type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'illegal' | 'gameEnd' | 'correct' | 'wrong';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const length = Math.floor(ac.sampleRate * 0.25);
  noise = ac.createBuffer(1, length, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** Percussive wooden click: band-passed noise with a fast decay. */
function click(ac: AudioContext, at: number, { freq = 1700, q = 1.4, gain = 0.55, decay = 0.07 } = {}) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(filter).connect(env).connect(ac.destination);
  src.start(at);
  src.stop(at + decay + 0.02);
}

/** Low body resonance under the click. */
function thump(ac: AudioContext, at: number, { from = 190, to = 85, gain = 0.35, decay = 0.09 } = {}) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + decay);
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(env).connect(ac.destination);
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

function tone(ac: AudioContext, at: number, freq: number, { type = 'sine' as OscillatorType, gain = 0.18, decay = 0.25 } = {}) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(env).connect(ac.destination);
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

const SOUNDS: Record<SoundName, (ac: AudioContext, t: number) => void> = {
  move: (ac, t) => {
    click(ac, t);
    thump(ac, t);
  },
  capture: (ac, t) => {
    click(ac, t, { freq: 2300, gain: 0.7, decay: 0.05 });
    click(ac, t + 0.028, { freq: 1500, gain: 0.6, decay: 0.08 });
    thump(ac, t + 0.02, { from: 160, to: 70, gain: 0.45, decay: 0.12 });
  },
  check: (ac, t) => {
    SOUNDS.move(ac, t);
    tone(ac, t + 0.02, 1318, { type: 'triangle', gain: 0.12, decay: 0.22 });
  },
  castle: (ac, t) => {
    SOUNDS.move(ac, t);
    click(ac, t + 0.11, { freq: 1500, gain: 0.45 });
    thump(ac, t + 0.11, { gain: 0.25 });
  },
  promote: (ac, t) => {
    SOUNDS.move(ac, t);
    [784, 1046, 1318].forEach((f, i) => tone(ac, t + 0.05 + i * 0.07, f, { gain: 0.1, decay: 0.2 }));
  },
  illegal: (ac, t) => {
    tone(ac, t, 155, { type: 'square', gain: 0.05, decay: 0.16 });
    thump(ac, t, { from: 120, to: 60, gain: 0.25, decay: 0.14 });
  },
  gameEnd: (ac, t) => {
    SOUNDS.move(ac, t);
    [523, 659, 784].forEach((f) => tone(ac, t + 0.08, f, { gain: 0.08, decay: 0.8 }));
  },
  correct: (ac, t) => {
    tone(ac, t, 784, { gain: 0.14, decay: 0.18 });
    tone(ac, t + 0.1, 1175, { gain: 0.14, decay: 0.35 });
  },
  wrong: (ac, t) => {
    tone(ac, t, 392, { type: 'triangle', gain: 0.14, decay: 0.18 });
    tone(ac, t + 0.12, 277, { type: 'triangle', gain: 0.14, decay: 0.3 });
  },
};

export function playSound(name: SoundName) {
  const ac = audio();
  if (!ac) return;
  try {
    SOUNDS[name](ac, ac.currentTime + 0.005);
  } catch {
    // Audio is best effort.
  }
}

/** The sound Chess.com-style boards use for a move given its SAN. */
export function soundForSan(san: string): SoundName {
  if (san.includes('#')) return 'gameEnd';
  if (san.includes('+')) return 'check';
  if (san.includes('=')) return 'promote';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}
