import { describe, expect, it } from 'vitest';
import { ideaClause, moveIdeas } from '@/lib/analysis/motifs';

const kinds = (fen: string, uci: string, prev?: { to: string; captured?: string }) =>
  moveIdeas(fen, uci, { prevMove: prev }).map((i) => i.kind);

describe('moveIdeas', () => {
  it('spots a pin to the king', () => {
    // 1. e4 e5 2. Nf3 Nc6 3. d4 Nf6 4. Bb5? no – here Bb5 pins c6 to e8 after ...d6.
    const fen = 'r1bqkb1r/ppp2ppp/2np1n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 5';
    expect(kinds(fen, 'f1b5')).toContain('pin');
  });

  it('spots a knight fork, naming the king first', () => {
    const fen = 'r3k3/8/8/8/8/8/3N4/4K3 w - - 0 1';
    const fork = moveIdeas(fen, 'd2c4').find((i) => i.kind === 'fork');
    expect(fork).toBeUndefined(); // c4 attacks neither
    const real = moveIdeas('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7').find((i) => i.kind === 'fork');
    expect(real && ideaClause(real, 'your', 'the')).toBe('forks the king and rook');
  });

  it('does not call a pawn that can be taken back a fork', () => {
    // ...cxd4 hits c3 and e3 but Nxd4 just takes it.
    const fen = 'r2qkb1r/1b1p1ppp/p1n1pn2/1pp5/3NP3/2N1B1P1/PPP2PBP/R2Q1RK1 b kq - 0 9';
    expect(kinds(fen, 'c5d4')).not.toContain('fork');
  });

  it('calls a recapture a recapture, not a free piece', () => {
    const fen = 'rnbqkb1r/pppp1ppp/5N2/4p3/4P3/8/PPPP1PPP/R1BQKBNR b KQkq - 0 3';
    expect(kinds(fen, 'd8f6', { to: 'f6', captured: 'n' })).toContain('recapture');
  });

  it('describes castling and development', () => {
    expect(kinds('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1')).toContain('castle');
    expect(kinds('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'g1f3')).toContain('develop');
  });

  it('notices a mate threat', () => {
    // Qh5 eyes f7 with the bishop on c4.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3';
    const threat = moveIdeas(fen, 'd1h5').find((i) => i.kind === 'mateThreat');
    expect(threat && ideaClause(threat, 'your', 'the')).toBe('threatens checkmate with Qxf7#');
  });

  it('flags giving up castling rights', () => {
    expect(kinds('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e1e2')).toContain('losesCastling');
  });
});
