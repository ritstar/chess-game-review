import { describe, expect, it } from 'vitest';
import { bookMoves } from '@/lib/analysis/review';
import { chessComBookPlies } from '@/lib/games/openingUrl';
import { parseGame } from '@/lib/games/pgn';

const url = (slug: string) => `https://www.chess.com/openings/${slug}`;

describe('chessComBookPlies', () => {
  it('reads the last book move from the opening URL', () => {
    expect(chessComBookPlies(url('Sicilian-Defense-Open-Najdorf-Variation-6.Be3'))).toBe(11);
    expect(chessComBookPlies(url('Kings-Indian-Attack-Double-Fianchetto-Pachman-System-6.e4-O-O'))).toBe(12);
    expect(chessComBookPlies(url('Bishops-Opening-Berlin-Vienna-Hybrid-Variation-4...d6'))).toBe(8);
    expect(chessComBookPlies(url('Reti-Opening-1...Nf6-2.d3-d5-3.g3'))).toBe(5);
    expect(chessComBookPlies(url('Sicilian-Defense...5.O-O-Bg7-6.c3-Nf6'))).toBe(12);
  });

  it('counts castling by both sides as two moves', () => {
    expect(chessComBookPlies(url('Queens-Gambit-Declined-Catalan-Opening...8.O-O-O-O-9.b3-b6'))).toBe(18);
    expect(chessComBookPlies(url('Sicilian-Defense-French-Variation...6.Bg2-Be7-7.O-O-O-O'))).toBe(14);
    expect(chessComBookPlies(url('Some-Opening-9.O-O-O'))).toBe(17);
  });

  it('is undefined when the URL is only a name', () => {
    expect(chessComBookPlies(url('Sicilian-Defense-Canal-Main-Line'))).toBeUndefined();
    expect(chessComBookPlies(undefined)).toBeUndefined();
  });

  it('makes exactly that many moves book', () => {
    const { plies } = parseGame('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3');
    expect(bookMoves(plies, {}, 11).filter(Boolean)).toHaveLength(11);
    expect(bookMoves(plies, {}, 99).every(Boolean)).toBe(true);
  });
});
