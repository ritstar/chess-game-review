'use client';

// Last-resort boundary for errors in the root layout itself; it replaces the
// whole document, so it can't rely on the app's stylesheet.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#161512', color: '#e8e6e3', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <main>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: '#a5a29d', fontSize: 14 }}>Reload the page to try again.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 8, border: 0, background: '#81b64c', color: '#fff', fontWeight: 700, fontSize: 15 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
