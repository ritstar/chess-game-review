import { describe, expect, it } from 'vitest';
import { divideGame, estimateRating, gradeFor } from '@/lib/analysis/phases';
import { parseGame } from '@/lib/games/pgn';

describe('phases', () => {
  it('splits a game into opening, middlegame and endgame', () => {
    // Queens and minor pieces come off quickly in this line.
    const { plies } = parseGame(
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O f6 6. d4 exd4 7. Nxd4 c5 8. Nb3 Qxd1 9. Rxd1 Bg4 10. f3 Be6 11. Nc3 Bd6 12. Be3 b6 13. a4 Ne7 14. Bf2 Nc6 15. Nd5 Bxd5 16. Rxd5 Nb4 17. Rd2 Ke7 18. Nd4 cxd4 19. Bxd4 Nc6 20. Bc3',
    );
    const { middle, end } = divideGame(plies, plies.map((_, i) => i < 8));
    expect(middle).not.toBeNull();
    expect(middle!).toBeGreaterThanOrEqual(8);
    expect(end === null || end > middle!).toBe(true);
  });

  it('grades phases like Chess.com icons', () => {
    expect(gradeFor(97)).toBe('best');
    expect(gradeFor(85)).toBe('good');
    expect(gradeFor(40)).toBe('blunder');
  });

  it('estimates a game rating that rises with accuracy', () => {
    expect(estimateRating(95, 40)!).toBeGreaterThan(estimateRating(80, 40)!);
    expect(estimateRating(50, 3)).toBeNull();
    // Short games are pulled toward the middle.
    expect(estimateRating(99, 10)!).toBeLessThan(estimateRating(99, 40)!);
  });
});
