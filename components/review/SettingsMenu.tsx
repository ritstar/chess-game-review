'use client';

import { Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BOARD_THEMES, DEPTH_PRESETS, type AnalysisDepth, type BoardTheme, type Settings } from '@/lib/settings';
import { cn } from '@/lib/utils';

export function SettingsMenu({
  settings,
  onChange,
  placement = 'up',
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  placement?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = (key: 'showBestArrow' | 'showEngineLines' | 'sound' | 'haptics', label: string) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm">
      {label}
      <input
        type="checkbox"
        className="size-4 accent-[var(--color-accent)]"
        checked={settings[key]}
        onChange={(e) => onChange({ ...settings, [key]: e.target.checked })}
      />
    </label>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SettingsIcon size={18} />
      </button>
      {open && (
        <div
          className={cn('card absolute right-0 z-50 w-72 p-4 shadow-2xl', placement === 'up' ? 'bottom-12' : 'top-12')}
          role="dialog"
          aria-label="Settings"
        >
          <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Analysis strength</p>
          <div className="mt-2 space-y-1">
            {(Object.keys(DEPTH_PRESETS) as AnalysisDepth[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange({ ...settings, depth: d })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm',
                  settings.depth === d ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface-2',
                )}
              >
                <span className="font-semibold">{DEPTH_PRESETS[d].label}</span>
                <span className="text-xs text-muted">{DEPTH_PRESETS[d].hint}</span>
              </button>
            ))}
          </div>

          <p className="mt-4 text-[11px] font-bold tracking-wider text-subtle uppercase">Board</p>
          <div className="mt-2 flex gap-2">
            {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`${BOARD_THEMES[t].label} board`}
                onClick={() => onChange({ ...settings, boardTheme: t })}
                className={cn(
                  'grid size-9 grid-cols-2 overflow-hidden rounded-md ring-offset-2 ring-offset-surface',
                  settings.boardTheme === t && 'ring-2 ring-accent',
                )}
              >
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} style={{ background: i === 0 || i === 3 ? BOARD_THEMES[t].light : BOARD_THEMES[t].dark }} />
                ))}
              </button>
            ))}
          </div>

          <div className="mt-3 border-t border-line pt-2">
            {toggle('showBestArrow', 'Show best-move arrow')}
            {toggle('showEngineLines', 'Show engine lines')}
            {toggle('sound', 'Sound')}
            {toggle('haptics', 'Haptics (phones)')}
          </div>
        </div>
      )}
    </div>
  );
}
