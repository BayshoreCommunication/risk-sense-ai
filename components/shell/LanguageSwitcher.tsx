'use client';

import { useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const t = useTranslations('locale');

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="group"
      aria-label={`${t('label')}: ${t('en')}`}
      data-testid="language-indicator"
    >
      {!compact ? <Languages aria-hidden="true" className="size-4 text-muted-foreground" /> : null}
      <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
        <span className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm">{t('en')}</span>
      </div>
    </div>
  );
}
