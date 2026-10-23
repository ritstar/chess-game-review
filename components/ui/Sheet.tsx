'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bottom sheet for phones: slides up over the page, closes on backdrop tap,
 * Escape, or dragging the handle down. Content scrolls inside the sheet.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  // Content renders only while open (and through the closing slide), so a
  // closed sheet costs nothing when the page behind it updates.
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onHandleUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!panel.current) return;
    panel.current.style.transition = '';
    panel.current.style.transform = '';
    if (d && d.dy > 80) onClose();
  };

  return (
    <div className={cn('fixed inset-0 z-[60]', !open && 'pointer-events-none')} aria-hidden={!open} inert={!open}>
      <div
        className={cn('absolute inset-0 bg-black/55 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] max-w-xl flex-col rounded-t-2xl border-t border-line bg-surface shadow-[0_-10px_40px_rgba(0,0,0,.4)] transition-transform duration-250 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
          className,
        )}
        onTransitionEnd={(e) => e.target === e.currentTarget && !open && setRendered(false)}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none items-center justify-between px-4 pt-2 pb-1"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-surface-3" aria-hidden />
          <div className="min-w-0 pt-3 text-[16px] font-bold">{title}</div>
          <button type="button" className="icon-btn -mr-2 mt-1" aria-label="Close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
            <X size={20} />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {rendered && children}
        </div>
      </div>
    </div>
  );
}
