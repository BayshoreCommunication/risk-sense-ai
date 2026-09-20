'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOCALES = ['en', 'bn'] as const;

export function LanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('locale');
  const [pending, startTransition] = useTransition();

  async function choose(nextLocale: (typeof LOCALES)[number]) {
    if (nextLocale === locale) return;
    const response = await fetch('/api/locale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: nextLocale }),
    });
    if (!response.ok) return;
    startTransition(() => router.refresh());
  }

  return (
    <div className={cn('flex items-center gap-2', className)} aria-label={t('label')}>
      {!compact ? <Languages aria-hidden="true" className="size-4 text-muted-foreground" /> : null}
      <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
        {LOCALES.map((nextLocale) => (
          <button
            key={nextLocale}
            type="button"
            aria-pressed={locale === nextLocale}
            disabled={pending}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
              locale === nextLocale ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => void choose(nextLocale)}
          >
            {t(nextLocale)}
          </button>
        ))}
      </div>
    </div>
  );
}
