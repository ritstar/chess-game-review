import { ImageResponse } from 'next/og';

export const alt = 'Game Review: free Stockfish analysis for Chess.com and Lichess games';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BADGES = [
  { label: 'Brilliant', symbol: '!!', color: '#26c2a3' },
  { label: 'Great', symbol: '!', color: '#749bbf' },
  { label: 'Best', symbol: 'star', color: '#81b64c' },
  { label: 'Mistake', symbol: '?', color: '#ffa459' },
  { label: 'Blunder', symbol: '??', color: '#fa412d' },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#161512', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: 22, background: '#81b64c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="68" height="68" viewBox="0 0 32 32">
              <path fill="#fff" d="M16 6a3.5 3.5 0 0 0-2 6.37V13h-2.5a1 1 0 0 0 0 2H13l-1.6 7h9.2L19 15h1.5a1 1 0 0 0 0-2H18v-.63A3.5 3.5 0 0 0 16 6Zm-6 18a1 1 0 0 0-1 1v1h14v-1a1 1 0 0 0-1-1H10Z" />
            </svg>
          </div>
          <div style={{ fontSize: 76, fontWeight: 800 }}>Game Review</div>
        </div>
        <div style={{ marginTop: 28, fontSize: 38, color: '#bab9b8', maxWidth: 960 }}>
          Free Stockfish 17 analysis for your Chess.com and Lichess games, right in the browser.
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 56 }}>
          {BADGES.map((b) => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderRadius: 999, background: '#262421', fontSize: 28 }}>
              <div style={{ width: 40, height: 40, borderRadius: 999, background: b.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22 }}>
                {b.symbol === 'star' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path fill="#fff" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" />
                  </svg>
                ) : (
                  b.symbol
                )}
              </div>
              {b.label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
