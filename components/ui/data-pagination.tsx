'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function useClientPagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, setPage, totalPages, pageItems };
}

type DataPaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function DataPagination({ page, totalPages, totalItems, pageSize, onPageChange, className }: DataPaginationProps) {
  const t = useTranslations('common.pagination');
  if (totalItems <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <nav className={cn('flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground', className)} aria-label={t('label')}>
      <span>{t('showing', { from, to, total: totalItems })}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft data-icon="inline-start" aria-hidden="true" />
          {t('previous')}
        </Button>
        <span className="min-w-20 text-center font-medium text-foreground">{t('page', { page, pages: totalPages })}</span>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          {t('next')}
          <ChevronRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
