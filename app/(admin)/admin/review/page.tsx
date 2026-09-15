'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AssessmentDetail } from '@/components/review/AssessmentDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { assessments, type AssessmentListItem, type AssessmentListResult } from '@/lib/assessments';

const LIMIT = 25;

/**
 * AI-03 mandatory-review queue: assessments whose confidence fell below the matrix's `mandatoryReviewBelow`
 * and that still await a human decision. Administrators review the extraction (flagged facts, explanation)
 * and follow up with the requestor / TAC content fixes; they do not record the decision (Overview.md roles).
 */
export default function MandatoryReviewQueuePage() {
  const locale = useLocale();
  const t = useTranslations('admin.reviewQueue');
  const classification = useTranslations('classification');
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssessmentListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AssessmentListItem | null>(null);

  const load = useCallback(() => {
    assessments
      .list({ mandatoryReview: 'true', ...(tab === 'pending' ? { pending: 'true' as const } : {}), sort: 'oldest', limit: LIMIT, page })
      .then(setData)
      .catch((e) => setError(toApiError(e).message));
  }, [tab, page]);
  useEffect(load, [load]);

  const items = data?.items ?? [];
  const pages = data?.pages ?? 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex gap-1 border-b pb-2">
        <Button size="sm" variant={tab === 'pending' ? 'default' : 'ghost'} onClick={() => { setTab('pending'); setPage(1); }}>
          {t('tabs.pending')}{data ? ` ${data.counts.pending}` : ''}
        </Button>
        <Button size="sm" variant={tab === 'all' ? 'default' : 'ghost'} onClick={() => { setTab('all'); setPage(1); }}>
          {t('tabs.all')}{data ? ` ${data.counts.all}` : ''}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.started')}</TableHead>
              <TableHead>{t('columns.requestor')}</TableHead>
              <TableHead>{t('columns.department')}</TableHead>
              <TableHead>{t('columns.personaScenario')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.classification')}</TableHead>
              <TableHead>{t('columns.confidence')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a._id}>
                <TableCell className="whitespace-nowrap">{new Date(a.createdAt).toLocaleString(locale)}</TableCell>
                <TableCell className="whitespace-nowrap">{a.requestor?.name ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{a.department?.name ?? '—'}</TableCell>
                <TableCell>
                  <div>{a.personaKey?.replace(/_/g, ' ') ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{a.status.replace(/_/g, ' ')}</Badge>
                </TableCell>
                <TableCell>{a.result ? classification.has(a.result.classification) ? classification(a.result.classification) : a.result.classification : '—'}</TableCell>
                <TableCell className="tabular-nums">{a.result ? `${a.result.confidence}%` : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setOpen(a)}>
                    {t('inspect')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? t('flagged', { count: data.total }) : t('loading')}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('pagination.previous')}
          </Button>
          <span>
            {t('pagination.page', { page, pages })}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            {t('pagination.next')}
          </Button>
        </div>
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('dialog.title', { id: open?._id.slice(-6) ?? '' })}</DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </DialogHeader>
          {open && <AssessmentDetail id={open._id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
