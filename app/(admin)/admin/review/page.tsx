'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { AssessmentDetail } from '@/components/review/AssessmentDetail';
import { formatIdentifierLabel } from '@/components/admin/format-identifier-label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { assessments, type AssessmentListItem, type AssessmentListResult } from '@/lib/assessments';

const LIMIT = 25;
const CLASSIFICATION_CLASS: Record<string, string> = {
  monitor_only: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
  risk: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
  elevated_risk: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/30 dark:bg-orange-400/10 dark:text-orange-300',
  issue: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300',
};

/**
 * AI-03 mandatory-review queue: assessments whose confidence fell below the matrix's `mandatoryReviewBelow`
 * and that still await a human decision. Administrators review the extraction (flagged facts, explanation)
 * and follow up with the requestor / TAC content fixes; they do not record the decision (Overview.md roles).
 */
export default function MandatoryReviewQueuePage() {
  const locale = useLocale();
  const t = useTranslations('admin.reviewQueue');
  const classification = useTranslations('classification');
  const statusT = useTranslations('status');
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
    <div className="page-shell">
      <PageHeader title={t('title')} description={t('description')} requirements={['AI-03', 'FR-20']} />
      <div className="inline-flex rounded-xl border bg-muted/35 p-1 shadow-sm">
        <Button size="sm" variant={tab === 'pending' ? 'default' : 'ghost'} aria-pressed={tab === 'pending'} onClick={() => { setTab('pending'); setPage(1); }}>
          {t('tabs.pending')}{data ? ` ${data.counts.pending}` : ''}
        </Button>
        <Button size="sm" variant={tab === 'all' ? 'default' : 'ghost'} aria-pressed={tab === 'all'} onClick={() => { setTab('all'); setPage(1); }}>
          {t('tabs.all')}{data ? ` ${data.counts.all}` : ''}
        </Button>
      </div>
      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
      <section className="data-panel fills" aria-busy={!data && !error}>
        <Table className="min-w-[880px] table-fixed min-[96rem]:min-w-[980px]" containerLabel={t('title')}>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-32">{t('columns.started')}</TableHead>
              <TableHead className="w-24">{t('columns.requestor')}</TableHead>
              <TableHead className="w-24">{t('columns.department')}</TableHead>
              <TableHead className="w-40">{t('columns.personaScenario')}</TableHead>
              <TableHead className="w-32">{t('columns.status')}</TableHead>
              <TableHead className="w-28">{t('columns.classification')}</TableHead>
              <TableHead className="w-28">{t('columns.confidence')}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && !error && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            )}
            {data && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a._id}>
                <TableCell className="whitespace-normal text-xs leading-5 text-muted-foreground">{new Date(a.createdAt).toLocaleString(locale)}</TableCell>
                <TableCell className="whitespace-normal font-medium">{a.requestor?.name ?? '—'}</TableCell>
                <TableCell className="max-w-40 whitespace-normal">{a.department?.name ?? '—'}</TableCell>
                <TableCell>
                  <div>{a.personaKey ? formatIdentifierLabel(a.personaKey) : '—'}</div>
                  <div className="text-xs text-muted-foreground">{a.scenarioKey ? formatIdentifierLabel(a.scenarioKey) : '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{statusT.has(a.status) ? statusT(a.status) : formatIdentifierLabel(a.status)}</Badge>
                </TableCell>
                <TableCell>
                  {a.result ? (
                    <Badge variant="outline" className={CLASSIFICATION_CLASS[a.result.classification]}>
                      {classification.has(a.result.classification) ? classification(a.result.classification) : formatIdentifierLabel(a.result.classification)}
                    </Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="min-w-28">
                  {a.result ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(100, a.result.confidence))}%` }} />
                      </div>
                      <span className="w-10 text-right font-medium tabular-nums">{a.result.confidence}%</span>
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setOpen(a)}>
                    <Eye data-icon="inline-start" aria-hidden="true" />
                    {t('inspect')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[min(64rem,calc(100vw-3rem))]">
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
