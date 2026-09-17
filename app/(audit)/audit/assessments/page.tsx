'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Database, History, ShieldCheck } from 'lucide-react';
import { AssessmentDetail } from '@/components/review/AssessmentDetail';
import { ReconstructionView } from '@/components/review/ReconstructionView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { assessments, type AssessmentListItem, type AssessmentListResult } from '@/lib/assessments';

const LIMIT = 25;

/** Audit role (read-only, whole tenant): every assessment, with the stored view and the FR-26 reconstruction side by side. */
export default function AuditAssessmentsPage() {
  const locale = useLocale();
  const t = useTranslations('audit.assessments');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssessmentListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ item: AssessmentListItem; mode: 'stored' | 'reconstruct' } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    assessments
      .list({ sort: 'newest', limit: LIMIT, page })
      .then(setData)
      .catch((e) => setError(toApiError(e).message))
      .finally(() => setLoading(false));
  }, [page]);
  useEffect(load, [load]);

  const items = data?.items ?? [];
  return (
    <div className="page-shell">
      <header className="workspace-header">
        <div className="max-w-3xl">
          <h1 className="page-heading">{t('title')}</h1>
          <p className="page-description mt-2">{t('description')}</p>
        </div>
      </header>

      {data && (
        <div className="data-panel grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-blue-500/10 text-blue-700"><Database className="size-4" aria-hidden="true" /></span><p className="text-sm font-medium">{t('count', { count: data.total })}</p></div>
          <div className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-700"><History className="size-4" aria-hidden="true" /></span><p className="text-sm font-medium"><span className="mr-1 text-xl tabular-nums">{data.counts.pending}</span>{t('summary.pending')}</p></div>
          <div className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700"><ShieldCheck className="size-4" aria-hidden="true" /></span><p className="text-sm font-medium"><span className="mr-1 text-xl tabular-nums">{data.counts.closed}</span>{status('closed')}</p></div>
        </div>
      )}

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div>}
      <div className="data-panel divide-y lg:hidden">
        {loading && <p className="p-8 text-center text-sm text-muted-foreground">{t('loading')}</p>}
        {!loading && data && items.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('empty')}</p>}
        {!loading && items.map((a) => (
          <article key={a._id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{a.requestor?.name ?? '—'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString(locale)}</p>
              </div>
              <Badge variant="secondary">{status.has(a.status) ? status(a.status) : a.status}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-muted-foreground">{t('columns.department')}</dt><dd className="mt-0.5 font-medium">{a.department?.name ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.personaScenario')}</dt><dd className="mt-0.5 font-medium">{a.personaKey?.replace(/_/g, ' ') ?? '—'} · {a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.classification')}</dt><dd className="mt-0.5 font-medium">{a.result ? classification.has(a.result.classification) ? classification(a.result.classification) : a.result.classification : '—'}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.confidence')}</dt><dd className="mt-0.5 font-medium tabular-nums">{a.result ? `${a.result.confidence}%` : '—'}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.decision')}</dt><dd className="mt-0.5 font-medium">{a.decision ? `${t.has(`decisionTypes.${a.decision.type}`) ? t(`decisionTypes.${a.decision.type}`) : a.decision.type}${a.decision.overriddenTo ? ` → ${classification.has(a.decision.overriddenTo) ? classification(a.decision.overriddenTo) : a.decision.overriddenTo}` : ''}` : '—'}</dd></div>
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen({ item: a, mode: 'stored' })}><Database aria-hidden="true" />{t('actions.stored')}</Button>
              <Button size="sm" variant="outline" onClick={() => setOpen({ item: a, mode: 'reconstruct' })}><History aria-hidden="true" />{t('actions.reconstruct')}</Button>
            </div>
          </article>
        ))}
      </div>
      <div className="data-panel hidden overflow-x-auto lg:block">
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
              <TableHead>{t('columns.decision')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">{t('loading')}</TableCell>
              </TableRow>
            )}
            {!loading && data && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {!loading && items.map((a) => (
              <TableRow key={a._id}>
                <TableCell className="whitespace-nowrap">{new Date(a.createdAt).toLocaleString(locale)}</TableCell>
                <TableCell className="whitespace-nowrap">{a.requestor?.name ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{a.department?.name ?? '—'}</TableCell>
                <TableCell>
                  <div>{a.personaKey?.replace(/_/g, ' ') ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{status.has(a.status) ? status(a.status) : a.status}</Badge>
                </TableCell>
                <TableCell>{a.result ? classification.has(a.result.classification) ? classification(a.result.classification) : a.result.classification : '—'}</TableCell>
                <TableCell className="tabular-nums">{a.result ? `${a.result.confidence}%` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{a.decision ? `${t.has(`decisionTypes.${a.decision.type}`) ? t(`decisionTypes.${a.decision.type}`) : a.decision.type}${a.decision.overriddenTo ? ` → ${classification.has(a.decision.overriddenTo) ? classification(a.decision.overriddenTo) : a.decision.overriddenTo}` : ''}` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="outline" className="mr-1" onClick={() => setOpen({ item: a, mode: 'stored' })}>
                    <Database aria-hidden="true" />{t('actions.stored')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen({ item: a, mode: 'reconstruct' })}>
                    <History aria-hidden="true" />{t('actions.reconstruct')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{data ? t('count', { count: data.total }) : t('loading')}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('pagination.previous')}
          </Button>
          <span>
            {t('pagination.page', { page, pages: data?.pages ?? 1 })}
          </span>
          <Button size="sm" variant="outline" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage(page + 1)}>
            {t('pagination.next')}
          </Button>
        </div>
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{open?.mode === 'reconstruct' ? t('dialog.reconstructedTitle') : t('dialog.storedTitle')} · {open?.item._id.slice(-6)}</DialogTitle>
            <DialogDescription>{open?.mode === 'reconstruct' ? t('dialog.reconstructedDescription') : t('dialog.storedDescription')}</DialogDescription>
          </DialogHeader>
          {open && (open.mode === 'reconstruct' ? <ReconstructionView id={open.item._id} /> : <AssessmentDetail id={open.item._id} />)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
