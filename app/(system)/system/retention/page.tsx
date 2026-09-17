'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, PlayCircle, ShieldCheck } from 'lucide-react';
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

  const formatWindow = (days: number) =>
    days % 365 === 0
      ? t('policyTable.years', { years: days / 365, days: days.toLocaleString(locale) })
      : t('policyTable.days', { days: days.toLocaleString(locale) });

  const policyRows = settings
    ? [
        {
          key: 'assessments',
          record: t('policyTable.records.assessments'),
          window: formatWindow(settings.retentionPolicy.assessmentDays),
          expiry: settings.plan === 'paid' ? t('policyTable.actions.archiveReduce') : t('policyTable.actions.reduce'),
          coverage: t('policyTable.coverage.enforced'),
          enforced: true,
        },
        {
          key: 'evidence',
          record: t('policyTable.records.evidence'),
          window: formatWindow(settings.retentionPolicy.evidenceDays),
          expiry: t('policyTable.actions.followAssessment'),
          coverage: t('policyTable.coverage.recorded'),
          enforced: false,
        },
        {
          key: 'audit',
          record: t('policyTable.records.audit'),
          window: formatWindow(settings.retentionPolicy.auditDays),
          expiry: t('policyTable.actions.preserve'),
          coverage: t('policyTable.coverage.reported'),
          enforced: false,
        },
        {
          key: 'datasets',
          record: t('policyTable.records.datasets'),
          window: t('policyTable.afterRetirement', { duration: formatWindow(settings.retentionPolicy.datasetHistoryDays) }),
          expiry: t('policyTable.actions.retainHistory'),
          coverage: t('policyTable.coverage.recorded'),
          enforced: false,
        },
      ]
    : [];

  return (
    <div className="page-shell">
      <header className="workspace-header">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="page-heading">{t('title')}</h1>
            <p className="page-description mt-2">{t('description')}</p>
          </div>
          {settings && <Badge variant={settings.plan === 'paid' ? 'default' : 'secondary'}>{settings.plan.toUpperCase()}</Badge>}
        </div>
      </header>

      {settings && (
        <>
          <Card className="overflow-hidden shadow-none">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{t('policyTable.title')}</CardTitle>
                  <CardDescription className="mt-1">{t('policyTable.description')}</CardDescription>
                </div>
                <Badge variant="outline">SEC-06</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <div className="divide-y md:hidden">
                {policyRows.map((row) => (
                  <article key={row.key} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-sm font-semibold">{row.record}</h2>
                      <Badge variant={row.enforced ? 'default' : 'outline'} className={row.enforced ? 'bg-emerald-600 text-white hover:bg-emerald-600' : undefined}>{row.coverage}</Badge>
                    </div>
                    <dl className="grid gap-3 text-xs">
                      <div><dt className="font-medium uppercase tracking-wide text-muted-foreground">{t('policyTable.columns.window')}</dt><dd className="mt-1 font-semibold tabular-nums">{row.window}</dd></div>
                      <div><dt className="font-medium uppercase tracking-wide text-muted-foreground">{t('policyTable.columns.expiry')}</dt><dd className="mt-1 leading-5 text-foreground/80">{row.expiry}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table className="min-w-[760px] table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[21%]">{t('policyTable.columns.record')}</TableHead>
                      <TableHead className="w-[25%]">{t('policyTable.columns.window')}</TableHead>
                      <TableHead className="w-[38%]">{t('policyTable.columns.expiry')}</TableHead>
                      <TableHead className="w-[16%] text-right">{t('policyTable.columns.coverage')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policyRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.record}</TableCell>
                        <TableCell className="whitespace-normal tabular-nums">{row.window}</TableCell>
                        <TableCell className="whitespace-normal">{row.expiry}</TableCell>
                        <TableCell className="text-right"><Badge variant={row.enforced ? 'default' : 'outline'} className={row.enforced ? 'bg-emerald-600 text-white hover:bg-emerald-600' : undefined}>{row.coverage}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card size="sm" className="shadow-none">
            <CardContent className="flex items-start gap-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${settings.plan === 'paid' ? 'bg-violet-500/10 text-violet-700' : 'bg-blue-500/10 text-blue-700'}`}>{settings.plan === 'paid' ? <Archive className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}</span>
              <div><p className="font-medium">{settings.plan === 'paid' ? t('policy.paidTitle') : t('policy.freeTitle')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{settings.plan === 'paid' ? t('policy.paidDescription') : t('policy.freeDescription')}</p></div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="control-strip flex flex-wrap items-center gap-2">
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
        <Card size="sm" className="shadow-none">
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
      <Card className="overflow-hidden shadow-none">
        <CardHeader className="border-b"><CardTitle>{t('history.title')}</CardTitle><CardDescription>{t('history.description')}</CardDescription></CardHeader>
        <CardContent className="px-0">
      <div className="divide-y md:hidden">
        {runs.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('empty')}</p>}
        {runs.map((r) => (
          <article key={r._id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{r.dryRun ? t('modes.dry') : t('modes.enforced')}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(r.ranAt).toLocaleString(locale)}</p></div><Badge variant="outline">{r.trigger}</Badge></div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-muted-foreground">{t('columns.flagged')}</dt><dd className="mt-1 font-semibold tabular-nums">{r.flagged}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.reduced')}</dt><dd className="mt-1 font-semibold tabular-nums">{r.reduced}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.archived')}</dt><dd className="mt-1 font-semibold tabular-nums">{r.archived}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.auditPastWindow')}</dt><dd className="mt-1 font-semibold tabular-nums">{r.auditPastRetention}</dd></div>
            </dl>
            {r.error && <p className="text-xs text-destructive">{r.error}</p>}
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
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
