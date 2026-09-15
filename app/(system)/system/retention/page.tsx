'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';

type Run = components['schemas']['RetentionRunResult'] & { _id: string; ranAt: string; trigger: string; error?: string };

/** System administrator: SEC-06 retention enforcement — dry run, real run, history. Policy numbers live on /system/tenant. */
export default function RetentionPage() {
  const locale = useLocale();
  const t = useTranslations('system.retention');
  const [runs, setRuns] = useState<Run[]>([]);
  const [last, setLast] = useState<components['schemas']['RetentionRunResult'] | null>(null);
  const [busy, setBusy] = useState<'dry' | 'real' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    api.GET('/system/retention/runs').then((r) => (r.data ? setRuns(r.data.data as Run[]) : setError(toApiError((r as { error?: unknown }).error).message)));
  }, []);
  useEffect(load, [load]);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'dry' : 'real');
    setError(null);
    setConfirm(false);
    const r = await api.POST('/system/retention/run', { body: { dryRun } });
    setBusy(null);
    if (!r.data) return setError(toApiError((r as { error?: unknown }).error).message);
    setLast(r.data.data);
    load();
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={busy !== null} onClick={() => void run(true)}>
          {busy === 'dry' ? t('running') : t('dryRun')}
        </Button>
        {!confirm ? (
          <Button variant="destructive" disabled={busy !== null} onClick={() => setConfirm(true)}>
            {t('runNow')}
          </Button>
        ) : (
          <>
            <span className="text-sm text-destructive">{t('confirmation')}</span>
            <Button variant="destructive" disabled={busy !== null} onClick={() => void run(false)}>
              {busy === 'real' ? t('running') : t('confirmRun')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t('cancel')}
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {last && (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-1 font-medium">
            {last.dryRun ? t('result.dryRun') : t('result.run')} · {last.plan.toUpperCase()} · {t('result.policy', { window: last.policy.assessmentDays, grace: last.policy.graceDays })}
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">{t('result.flagged', { count: last.flagged })}</Badge>
            <Badge variant="outline">{t('result.reduced', { count: last.reduced })}</Badge>
            <Badge variant="outline">{t('result.archived', { count: last.archived })}</Badge>
            <Badge variant="outline">{t('result.messagesRemoved', { count: last.messagesRemoved })}</Badge>
            <Badge variant="outline">{t('result.auditPastWindow', { count: last.auditPastRetention })}</Badge>
            <Badge variant="outline">{t('result.duration', { value: last.durationMs })}</Badge>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.when')}</TableHead>
              <TableHead>{t('columns.trigger')}</TableHead>
              <TableHead>{t('columns.mode')}</TableHead>
              <TableHead className="text-right">{t('columns.flagged')}</TableHead>
              <TableHead className="text-right">{t('columns.reduced')}</TableHead>
              <TableHead className="text-right">{t('columns.archived')}</TableHead>
              <TableHead className="text-right">{t('columns.auditPastWindow')}</TableHead>
              <TableHead>{t('columns.error')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {runs.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="whitespace-nowrap">{new Date(r.ranAt).toLocaleString(locale)}</TableCell>
                <TableCell>{r.trigger}</TableCell>
                <TableCell>{r.dryRun ? t('modes.dry') : t('modes.enforced')}</TableCell>
                <TableCell className="text-right tabular-nums">{r.flagged}</TableCell>
                <TableCell className="text-right tabular-nums">{r.reduced}</TableCell>
                <TableCell className="text-right tabular-nums">{r.archived}</TableCell>
                <TableCell className="text-right tabular-nums">{r.auditPastRetention}</TableCell>
                <TableCell className="text-xs text-destructive">{r.error ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
