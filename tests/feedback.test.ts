import { describe, expect, it } from 'vitest';
import { voice } from '@/lib/analysis/explain';
import { detectThreats } from '@/lib/analysis/tactics';
import { figurine } from '@/lib/format';
import { hapticForSan } from '@/lib/haptics';
import { soundForSan } from '@/lib/sound';

describe('sounds and haptics', () => {
  it('picks the sound from the SAN', () => {
    expect(soundForSan('e4')).toBe('move');
    expect(soundForSan('Nxe5')).toBe('capture');
    expect(soundForSan('Qh5+')).toBe('check');
    expect(soundForSan('O-O-O')).toBe('castle');
    expect(soundForSan('e8=Q')).toBe('promote');
    expect(soundForSan('Qxf7#')).toBe('gameEnd');
    expect(hapticForSan('Bxc6+')).toBe('check');
    expect(hapticForSan('Bxc6')).toBe('capture');
  });
});

describe('figurine notation', () => {
  it('replaces piece letters only', () => {
    expect(figurine('Nf3')).toBe('♘f3');
    expect(figurine('Qxd3')).toBe('♕xd3');
    expect(figurine('exd5')).toBe('exd5');
    expect(figurine('e8=Q+')).toBe('e8=♕+');
    expect(figurine('O-O')).toBe('O-O');
  });
});

describe('voice', () => {
  it('speaks to the reader about their own and their opponent’s moves', () => {
    expect(voice('w', 'w').verb('go', 'goes')).toBe('You go');
    expect(voice('b', 'w').verb('go', 'goes')).toBe('Your opponent goes');
    expect(voice('b', 'w').theirs).toBe('your');
    expect(voice('w').verb('go', 'goes')).toBe('White goes');
  });
});

describe('detectThreats', () => {
  it('finds a bishop attacking a queen', () => {
    // Bb5, defended by the a4 pawn, hits the queen on d7 (and pins it).
    const threat = detectThreats('4k3/3q4/8/8/P7/8/8/4KB2 w - - 0 1', 'f1b5');
    expect(threat?.targets).toEqual([{ square: 'd7', piece: 'q' }]);
  });

  it('ignores a piece that just hangs itself', () => {
    // The bishop lands where the queen simply takes it.
    expect(detectThreats('4k3/8/8/8/2q5/8/8/4KB2 w - - 0 1', 'f1b5')).toBeNull();
  });
});
