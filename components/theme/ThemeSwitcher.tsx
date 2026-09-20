'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
import { cn } from '@/lib/utils';

export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        {dark ? <Moon aria-hidden="true" className="size-4 text-primary" /> : <Sun aria-hidden="true" className="size-4 text-muted-foreground" />}
        <span>{t('darkMode')}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label={t('darkMode')}
        title={dark ? t('switchToLight') : t('switchToDark')}
        className={cn(
          'group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 outline-none transition-[background-color,border-color,box-shadow] duration-[450ms]',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none',
          dark ? 'border-primary/60 bg-primary shadow-[inset_0_1px_2px_rgba(6,29,67,0.18)]' : 'border-border bg-muted hover:border-primary/35',
        )}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setTheme(dark ? 'light' : 'dark', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }}
      >
        <Sun
          aria-hidden="true"
          className={cn('absolute left-1 z-20 size-3 text-amber-600 transition-[opacity,transform] duration-[450ms] motion-reduce:transition-none', dark ? 'scale-75 opacity-0' : 'scale-100 opacity-100')}
        />
        <Moon
          aria-hidden="true"
          className={cn('absolute right-1 z-20 size-3 text-primary transition-[opacity,transform] duration-[450ms] motion-reduce:transition-none', dark ? 'scale-100 opacity-100' : 'scale-75 opacity-0')}
        />
        <span
          aria-hidden="true"
          className={cn(
            'relative z-10 size-5 rounded-full bg-card shadow-[0_2px_6px_rgba(6,29,67,0.28)] transition-transform duration-[450ms] ease-out motion-reduce:transition-none',
            dark ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
