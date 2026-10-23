export type OpeningBook = Record<string, [eco: string, name: string]>;

let bookPromise: Promise<OpeningBook> | null = null;

/** Lazily load the opening book (≈120 KB gzipped) once per session. */
export function loadOpeningBook(): Promise<OpeningBook> {
  bookPromise ??= fetch('/data/openings.json')
    .then((r) => (r.ok ? (r.json() as Promise<OpeningBook>) : {}))
    .catch(() => {
      bookPromise = null;
      return {};
    });
  return bookPromise;
}

/** FEN without the half-move and full-move counters. */
export function epd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function lookupOpening(book: OpeningBook, fen: string): { eco: string; name: string } | null {
  const hit = book[epd(fen)];
  return hit ? { eco: hit[0], name: hit[1] } : null;
}
