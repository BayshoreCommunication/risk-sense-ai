'use client';

import { Laptop, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { value: ThemePreference; message: 'system' | 'light' | 'dark'; icon: LucideIcon }[] = [
  { value: 'system', message: 'system', icon: Laptop },
  { value: 'light', message: 'light', icon: Sun },
  { value: 'dark', message: 'dark', icon: Moon },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn('space-y-2', className)}>
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Laptop aria-hidden="true" className="size-4 text-muted-foreground" />
        <span>{t('label')}</span>
      </span>
      <div
        role="radiogroup"
        aria-label={t('label')}
        className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/65 p-1 shadow-inner"
      >
        {OPTIONS.map((option) => {
          const selected = theme === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(
                'flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[0.68rem] font-semibold outline-none transition-[background-color,color,box-shadow] duration-200',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted motion-reduce:transition-none',
                selected
                  ? 'bg-card text-primary shadow-[0_2px_8px_rgba(6,29,67,0.12)]'
                  : 'text-muted-foreground hover:bg-card/55 hover:text-foreground',
              )}
              onClick={() => setTheme(option.value)}
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{t(option.message)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
