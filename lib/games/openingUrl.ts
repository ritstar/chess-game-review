/**
 * How far Chess.com's opening book follows the game, in plies. Their opening
 * URL ends with the last book moves after the opening's name, numbered as in
 * the game: "…-Najdorf-Variation-6.Be3" (11 plies), "…-Pachman-System-6.e4-O-O"
 * (12), "…-Catalan-Opening...8.O-O-O-O-9.b3-b6" (18), "…-Variation-4...d6" (8).
 * Undefined when the URL is only a name.
 */
export function chessComBookPlies(eco: string | undefined): number | undefined {
  const slug = eco?.split('/openings/')[1];
  if (!slug) return undefined;
  // The last "N." or "N..." and the one or two moves after it.
  const m = /(?:^|-|\.{3})(\d+)(\.{3}|\.)([^.]+)$/.exec(decodeURIComponent(slug));
  if (!m) return undefined;
  const moveNumber = Number(m[1]);
  if (m[2] === '...') return 2 * moveNumber;
  // Castling is written with the same hyphen that separates moves: "O-O-O-O" is two moves.
  const moves = m[3].replace(/O(?:-O)+/g, (run) => (run.length > 5 ? 'x-x' : 'x')).split('-').length;
  return 2 * (moveNumber - 1) + Math.min(2, moves);
}
