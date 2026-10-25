import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        ♞
      </p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-md text-sm text-muted">This square is empty. Head back and review a game instead.</p>
      <Link href="/" className="btn btn-primary">
        Go to Game Review
      </Link>
    </main>
  );
}
