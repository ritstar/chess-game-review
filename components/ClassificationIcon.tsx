import { CLASSIFICATION_LABEL, type Classification } from '@/lib/analysis/types';
import { cn } from '@/lib/utils';

export function classificationColor(c: Classification): string {
  return `var(--color-${c})`;
}

/* ── Glyphs ───────────────────────────────────────────────────────────
 * Drawn for this app on an 18×18 grid, in the style chess players know
 * from Chess.com's review: a solid white symbol on a coloured disc. Shapes
 * use `currentColor` so each can be painted twice, once as a soft shadow.
 */

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Scale a glyph about the disc's centre and slide it sideways (for "!!", "?!", "??"). */
const at = (x: number, scale: number) => `translate(${x} 8.75) scale(${scale}) translate(-9 -8.75)`;

function Bang({ x = 9, scale = 1 }: { x?: number; scale?: number }) {
  return (
    <g transform={at(x, scale)}>
      <path d="M7.75 3.7h2.5l-.48 6.2H8.23z" />
      <circle cx="9" cy="12.55" r="1.25" />
    </g>
  );
}

function Question({ x = 9, scale = 1 }: { x?: number; scale?: number }) {
  return (
    <g transform={at(x, scale)}>
      <path d="M6.45 6.35C6.5 4.7 7.6 3.75 9.05 3.75c1.5 0 2.6.95 2.6 2.3 0 1.05-.55 1.65-1.35 2.2-.85.6-1.25 1-1.25 2.05" {...stroke} strokeWidth="2" />
      <circle cx="9.05" cy="13.1" r="1.25" />
    </g>
  );
}

const GLYPH: Record<Classification, React.ReactNode> = {
  brilliant: (
    <>
      <Bang x={6.75} scale={0.92} />
      <Bang x={11.25} scale={0.92} />
    </>
  ),
  great: <Bang scale={1.02} />,
  best: (
    <path
      d="M9 3.55L10.38 7.15L14.23 7.35L11.23 9.77L12.23 13.5L9 11.4L5.77 13.5L6.77 9.77L3.77 7.35L7.62 7.15Z"
      stroke="currentColor"
      strokeWidth=".9"
      strokeLinejoin="round"
    />
  ),
  excellent: (
    <>
      <rect x="4.2" y="8.1" width="2.2" height="5.3" rx=".45" />
      <path d="M7.25 13.4V8.2l2.3-4.1c.22-.4.72-.52 1.1-.3.72.42 1.05 1.25.85 2.05l-.42 1.65h2.42c.82 0 1.42.75 1.24 1.55l-.8 3.35c-.15.6-.68 1-1.3 1z" />
    </>
  ),
  good: <path d="M5.1 9.2l2.55 2.55 5.25-5.6" {...stroke} strokeWidth="2.3" />,
  book: (
    <path d="M8.5 5.45C7.3 4.65 5.8 4.4 4.1 4.6v7.5c1.7-.2 3.2.05 4.4.85zM9.5 5.45c1.2-.8 2.7-1.05 4.4-.85v7.5c-1.7-.2-3.2.05-4.4.85z" />
  ),
  forced: <path d="M4.7 8.75h7.6M9.35 5.5l3.2 3.25-3.2 3.25" {...stroke} strokeWidth="2.1" />,
  inaccuracy: (
    <>
      <Question x={6.7} scale={0.84} />
      <Bang x={12.1} scale={0.92} />
    </>
  ),
  mistake: <Question />,
  miss: <path d="M5.9 5.65l6.2 6.2M12.1 5.65l-6.2 6.2" {...stroke} strokeWidth="2.3" />,
  blunder: (
    <>
      <Question x={6.05} scale={0.8} />
      <Question x={11.95} scale={0.8} />
    </>
  ),
};

/** Round badge in the classification colour, as used on the board and move list. */
export function ClassificationIcon({
  classification,
  size = 18,
  className,
}: {
  classification: Classification;
  size?: number;
  className?: string;
}) {
  const glyph = GLYPH[classification];
  return (
    <svg
      role="img"
      aria-label={CLASSIFICATION_LABEL[classification]}
      viewBox="0 0 18 18"
      className={cn('inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <title>{CLASSIFICATION_LABEL[classification]}</title>
      {/* A soft shadow under the disc and under the symbol gives the raised look. */}
      <circle cx="9" cy="9.25" r="8.75" fill="#000" opacity=".3" />
      <circle cx="9" cy="8.75" r="8.75" fill={classificationColor(classification)} />
      <g transform="translate(0 .55)" fill="#000" color="#000" opacity=".22">
        {glyph}
      </g>
      <g fill="#fff" color="#fff">
        {glyph}
      </g>
    </svg>
  );
}
