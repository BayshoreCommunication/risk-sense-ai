'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, DatabaseZap, PlayCircle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [settings, setSettings] = useState<components['schemas']['TenantSettings'] | null>(null);

  const load = useCallback(() => {
    api.GET('/system/retention/runs').then((r) => (r.data ? setRuns(r.data.data as Run[]) : setError(toApiError((r as { error?: unknown }).error).message)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api.GET('/system/tenant').then((result) => {
      if (result.data) setSettings(result.data.data);
    });
  }, []);

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
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="relative overflow-hidden rounded-2xl border bg-card px-5 py-6 shadow-sm sm:px-7">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-primary/10 to-transparent" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><DatabaseZap className="size-4" aria-hidden="true" />{t('eyebrow')}</div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('description')}</p>
          </div>
          {settings && <Badge variant={settings.plan === 'paid' ? 'default' : 'secondary'}>{settings.plan.toUpperCase()}</Badge>}
        </div>
      </header>

      {settings && (
        <Card size="sm">
          <CardContent className="flex items-start gap-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${settings.plan === 'paid' ? 'bg-violet-500/10 text-violet-700' : 'bg-blue-500/10 text-blue-700'}`}>{settings.plan === 'paid' ? <Archive className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}</span>
            <div><p className="font-medium">{settings.plan === 'paid' ? t('policy.paidTitle') : t('policy.freeTitle')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{settings.plan === 'paid' ? t('policy.paidDescription') : t('policy.freeDescription')}</p></div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4 shadow-sm">
        <Button variant="outline" disabled={busy !== null} onClick={() => void run(true)}>
          <PlayCircle aria-hidden="true" />{busy === 'dry' ? t('running') : t('dryRun')}
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
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div>}
      {last && (
        <Card size="sm">
          <CardHeader>
          <div className="mb-1 font-medium">
            {last.dryRun ? t('result.dryRun') : t('result.run')} · {last.plan.toUpperCase()} · {t('result.policy', { window: last.policy.assessmentDays, grace: last.policy.graceDays })}
          </div>
          </CardHeader>
          <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">{t('result.flagged', { count: last.flagged })}</Badge>
            <Badge variant="outline">{t('result.reduced', { count: last.reduced })}</Badge>
            <Badge variant="outline">{t('result.archived', { count: last.archived })}</Badge>
            <Badge variant="outline">{t('result.messagesRemoved', { count: last.messagesRemoved })}</Badge>
            <Badge variant="outline">{t('result.auditPastWindow', { count: last.auditPastRetention })}</Badge>
            <Badge variant="outline">{t('result.duration', { value: last.durationMs })}</Badge>
          </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="border-b"><CardTitle>{t('history.title')}</CardTitle><CardDescription>{t('history.description')}</CardDescription></CardHeader>
        <CardContent className="px-0">
      <div className="overflow-x-auto">
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
        </CardContent>
      </Card>
    </div>
  );
}
