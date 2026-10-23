import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'Game Review — free Stockfish analysis for Chess.com & Lichess',
    template: '%s · Game Review',
  },
  description:
    'Review your Chess.com and Lichess games with Stockfish 17, right in your browser. Move-by-move classifications, accuracy, key moments and plain-English explanations — free and private.',
  applicationName: 'Game Review',
  keywords: ['chess', 'game review', 'stockfish', 'chess.com', 'lichess', 'analysis', 'accuracy'],
  openGraph: {
    title: 'Game Review',
    description: 'Free Stockfish game review for Chess.com and Lichess games.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#161512',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
