import { ArrowRight, BookOpen, Check, Star, ThumbsUp, X } from 'lucide-react';
import { CLASSIFICATION_LABEL, type Classification } from '@/lib/analysis/types';
import { cn } from '@/lib/utils';

const GLYPH: Partial<Record<Classification, string>> = {
  brilliant: '!!',
  great: '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

const ICON = {
  best: Star,
  excellent: ThumbsUp,
  good: Check,
  book: BookOpen,
  forced: ArrowRight,
  miss: X,
} as const;

export function classificationColor(c: Classification): string {
  return `var(--color-${c})`;
}

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
  const Icon = (ICON as Record<string, typeof Star>)[classification];
  return (
    <span
      role="img"
      aria-label={CLASSIFICATION_LABEL[classification]}
      title={CLASSIFICATION_LABEL[classification]}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white', className)}
      style={{
        width: size,
        height: size,
        background: classificationColor(classification),
        fontSize: size * (glyph && glyph.length > 1 ? 0.5 : 0.62),
        letterSpacing: glyph && glyph.length > 1 ? '-0.06em' : undefined,
        boxShadow: '0 1px 2px rgba(0,0,0,.35)',
      }}
    >
      {glyph ?? (Icon && <Icon size={size * 0.6} strokeWidth={3} fill={classification === 'best' ? 'currentColor' : 'none'} />)}
    </span>
  );
}
