'use client';

import { Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { hapticsSupported } from '@/lib/haptics';
import { BOARD_THEMES, DEPTH_PRESETS, type AnalysisDepth, type BoardTheme, type Settings } from '@/lib/settings';
import { cn } from '@/lib/utils';

type Toggle = 'showBestArrow' | 'showEngineLines' | 'sound' | 'haptics';

const TOGGLES: { key: Toggle; label: string; hint?: string }[] = [
  { key: 'showEngineLines', label: 'Engine lines' },
  { key: 'showBestArrow', label: 'Best-move arrow' },
  { key: 'sound', label: 'Sound' },
  { key: 'haptics', label: 'Haptics', hint: 'Android, and recent iPhones' },
];

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

/** All review settings; used in the desktop dropdown and the phone menu sheet. */
export function SettingsFields({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  // Only rendered client-side (the review screen never server-renders).
  const canVibrate = hapticsSupported();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Analysis strength</p>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-bg/60 p-1">
          {(Object.keys(DEPTH_PRESETS) as AnalysisDepth[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ ...settings, depth: d })}
              className={cn(
                'rounded-md py-2 text-[13px] font-semibold transition-colors',
                settings.depth === d ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg',
              )}
            >
              {DEPTH_PRESETS[d].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-subtle">{DEPTH_PRESETS[settings.depth].hint}</p>
      </div>

      <div>
        <p className="text-[11px] font-bold tracking-wider text-subtle uppercase">Board</p>
        <div className="mt-2 flex gap-2.5">
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-label={`${BOARD_THEMES[t].label} board`}
              aria-pressed={settings.boardTheme === t}
              onClick={() => onChange({ ...settings, boardTheme: t })}
              className={cn(
                'grid size-10 grid-cols-2 overflow-hidden rounded-lg ring-offset-2 ring-offset-surface',
                settings.boardTheme === t && 'ring-2 ring-accent',
              )}
            >
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={{
                    background: i === 0 || i === 3 ? BOARD_THEMES[t].light : BOARD_THEMES[t].dark,
                    backgroundImage: BOARD_THEMES[t].texture,
                  }}
                />
              ))}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-line/70 border-t border-line">
        {TOGGLES.filter((t) => t.key !== 'haptics' || canVibrate).map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="block text-[14px]">{label}</span>
              {hint && <span className="block text-[12px] text-subtle">{hint}</span>}
            </span>
            <Switch checked={settings[key]} label={label} onChange={(v) => onChange({ ...settings, [key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Desktop settings dropdown. */
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

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SettingsIcon size={18} />
      </button>
      {open && (
        <div
          className={cn('card absolute right-0 z-50 w-80 p-4 shadow-2xl', placement === 'up' ? 'bottom-12' : 'top-12')}
          role="dialog"
          aria-label="Settings"
        >
          <SettingsFields settings={settings} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
