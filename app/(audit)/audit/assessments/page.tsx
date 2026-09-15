'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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

  const load = useCallback(() => {
    assessments
      .list({ sort: 'newest', limit: LIMIT, page })
      .then(setData)
      .catch((e) => setError(toApiError(e).message));
  }, [page]);
  useEffect(load, [load]);

  const items = data?.items ?? [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
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
              <TableHead>{t('columns.decision')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
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
                  <Badge variant="secondary">{status.has(a.status) ? status(a.status) : a.status}</Badge>
                </TableCell>
                <TableCell>{a.result ? classification.has(a.result.classification) ? classification(a.result.classification) : a.result.classification : '—'}</TableCell>
                <TableCell className="tabular-nums">{a.result ? `${a.result.confidence}%` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{a.decision ? `${t.has(`decisionTypes.${a.decision.type}`) ? t(`decisionTypes.${a.decision.type}`) : a.decision.type}${a.decision.overriddenTo ? ` → ${classification.has(a.decision.overriddenTo) ? classification(a.decision.overriddenTo) : a.decision.overriddenTo}` : ''}` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="outline" className="mr-1" onClick={() => setOpen({ item: a, mode: 'stored' })}>
                    {t('actions.stored')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen({ item: a, mode: 'reconstruct' })}>
                    {t('actions.reconstruct')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
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
