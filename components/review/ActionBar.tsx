import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Action {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}

export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  tone?: 'green' | 'neutral';
}

/** Bottom bar of the review: secondary tools plus one big primary button. */
export function ActionBar({
  actions,
  primary,
  className,
  compact = false,
}: {
  actions: Action[];
  primary: PrimaryAction;
  className?: string;
  /** Slimmer bar for the full-screen phone layout. */
  compact?: boolean;
}) {
  const PrimaryIcon = primary.icon;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {actions.map(({ key, label, icon: Icon, onClick, disabled }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg active:bg-surface-2 disabled:opacity-35 disabled:hover:bg-transparent',
            compact ? 'py-1 text-[11.5px]' : 'py-1.5 text-[12.5px]',
          )}
        >
          <Icon size={compact ? 20 : 22} strokeWidth={2.2} />
          <span className="truncate">{label}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        className={cn(
          'btn ml-1 flex-[1.6] rounded-xl px-2 whitespace-nowrap',
          compact ? 'h-11' : 'h-14',
          primary.label.length > 8 ? 'text-[16px] font-extrabold sm:text-[18px]' : 'text-[19px] font-extrabold',
          primary.tone === 'neutral' ? 'bg-surface-3 text-fg hover:bg-[#45423e]' : 'btn-primary',
        )}
      >
        {PrimaryIcon && <PrimaryIcon size={20} strokeWidth={2.6} className={cn(primary.label.length > 8 && 'hidden sm:block')} />}
        {primary.label}
      </button>
    </div>
  );
}
