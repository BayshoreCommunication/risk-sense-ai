'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, ChartNoAxesColumn, Database, FileText, FolderOpen, History, PlayCircle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shell/PageHeader';
import { api, toApiError } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/types';

type Run = components['schemas']['RetentionRunResult'] & { _id: string; ranAt: string; trigger: string; error?: string };
type Settings = components['schemas']['TenantSettings'];
type TenantPatch = NonNullable<paths['/system/tenant']['patch']['requestBody']>['content']['application/json'];
type RetentionField = keyof Settings['retentionPolicy'];

const RETENTION_FIELDS: RetentionField[] = ['assessmentDays', 'evidenceDays', 'auditDays', 'datasetHistoryDays'];

/** System administrator: SEC-06 tenant policy editing plus dry-run/enforced lifecycle operations. */
export default function RetentionPage() {
  const locale = useLocale();
  const t = useTranslations('system.retention');
  const tenantT = useTranslations('system.tenant');
  const [runs, setRuns] = useState<Run[]>([]);
  const [last, setLast] = useState<components['schemas']['RetentionRunResult'] | null>(null);
  const [busy, setBusy] = useState<'dry' | 'real' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [policyDraft, setPolicyDraft] = useState<Settings['retentionPolicy'] | null>(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState<string | null>(null);

  const load = useCallback(() => {
    api.GET('/system/retention/runs').then((r) => (r.data ? setRuns(r.data.data as Run[]) : setError(toApiError((r as { error?: unknown }).error).message)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api.GET('/system/tenant').then((result) => {
      if (result.data) {
        setSettings(result.data.data);
        setPolicyDraft(result.data.data.retentionPolicy);
      } else {
        setError(toApiError((result as { error?: unknown }).error).message);
      }
    });
  }, []);

  function updatePolicy(field: RetentionField, value: number) {
    if (settings?.plan !== 'paid') return;
    setPolicyDraft((current) => current ? { ...current, [field]: value } : current);
    setPolicySaved(null);
    setError(null);
  }

  async function savePolicy() {
    if (!settings || !policyDraft || settings.plan !== 'paid') return;
    const body: TenantPatch = { retentionPolicy: policyDraft };
    setPolicySaving(true);
    setPolicySaved(null);
    setError(null);
    const result = await api.PATCH('/system/tenant', { body });
    setPolicySaving(false);
    if (!result.data) {
      setError(toApiError((result as { error?: unknown }).error).message);
      return;
    }
    setSettings(result.data.data);
    setPolicyDraft(result.data.data.retentionPolicy);
    setPolicySaved(tenantT('saved', { time: new Date().toLocaleTimeString(locale) }));
  }

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

  const displayedPolicy = policyDraft ?? settings?.retentionPolicy ?? null;
  const policyDirty = Boolean(
    settings &&
      policyDraft &&
      RETENTION_FIELDS.some((field) => settings.retentionPolicy[field] !== policyDraft[field]),
  );

  const policyRows = settings && displayedPolicy
    ? [
        {
          key: 'assessments',
          field: 'assessmentDays' as const,
          icon: FileText,
          tile: 'bg-blue-500/10 text-blue-700',
          record: t('policyTable.records.assessments'),
          days: displayedPolicy.assessmentDays,
          expiry: settings.plan === 'paid' ? t('policyTable.actions.archiveReduce') : t('policyTable.actions.reduce'),
          coverage: t('policyTable.coverage.enforced'),
          enforced: true,
        },
        {
          key: 'evidence',
          field: 'evidenceDays' as const,
          icon: FolderOpen,
          tile: 'bg-indigo-500/10 text-indigo-700',
          record: t('policyTable.records.evidence'),
          days: displayedPolicy.evidenceDays,
          expiry: t('policyTable.actions.followAssessment'),
          coverage: t('policyTable.coverage.recorded'),
          enforced: false,
        },
        {
          key: 'audit',
          field: 'auditDays' as const,
          icon: ChartNoAxesColumn,
          tile: 'bg-emerald-500/10 text-emerald-700',
          record: t('policyTable.records.audit'),
          days: displayedPolicy.auditDays,
          expiry: t('policyTable.actions.preserve'),
          coverage: t('policyTable.coverage.reported'),
          enforced: false,
        },
        {
          key: 'datasets',
          field: 'datasetHistoryDays' as const,
          icon: Database,
          tile: 'bg-violet-500/10 text-violet-700',
          record: t('policyTable.records.datasets'),
          days: displayedPolicy.datasetHistoryDays,
          expiry: t('policyTable.actions.retainHistory'),
          coverage: t('policyTable.coverage.recorded'),
          enforced: false,
        },
      ]
    : [];

  return (
    <div className="page-shell">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['SEC-06']}
      />

      {settings && (
        <Card className="overflow-hidden shadow-[0_10px_30px_rgba(15,35,65,0.06)]">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-3"><span className="card-icon"><ShieldCheck className="size-5" aria-hidden="true" /></span>{t('policyTable.title')}</CardTitle>
                <CardDescription className="mt-1">{t('policyTable.description')}</CardDescription>
              </div>
              <Badge variant="outline">{settings.plan.toUpperCase()}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y md:hidden">
              {policyRows.map((row) => {
                const Icon = row.icon;
                const windowDescription = row.field === 'datasetHistoryDays'
                  ? t('policyTable.afterRetirement', { duration: formatWindow(row.days) })
                  : formatWindow(row.days);
                return (
                  <article key={row.key} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${row.tile}`}><Icon className="size-4" aria-hidden="true" /></span>
                        <div><h2 className="text-sm font-semibold">{row.record}</h2><p className="mt-0.5 text-xs text-muted-foreground">{row.coverage}</p></div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`retention-${row.field}`}>{tenantT(`policy.fields.${row.field}`)}</Label>
                      <Input
                        id={`retention-${row.field}`}
                        type="number"
                        min={1}
                        disabled={settings.plan === 'free'}
                        value={row.days}
                        onChange={(event) => updatePolicy(row.field, Number(event.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">{windowDescription}</p>
                    </div>
                    <div className="flex items-start gap-2 text-xs leading-5 text-foreground/80">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${row.key === 'audit' ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                      <span>{row.expiry}</span>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden md:block">
              <Table className="min-w-[760px] table-fixed">
                <TableHeader className="bg-muted/35">
                  <TableRow>
                    <TableHead className="w-[38%]">{t('policyTable.columns.record')}</TableHead>
                    <TableHead className="w-[25%]">{t('policyTable.columns.window')}</TableHead>
                    <TableHead className="w-[37%]">{t('policyTable.columns.expiry')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policyRows.map((row) => {
                    const Icon = row.icon;
                    const windowDescription = row.field === 'datasetHistoryDays'
                      ? t('policyTable.afterRetirement', { duration: formatWindow(row.days) })
                      : formatWindow(row.days);
                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${row.tile}`}><Icon className="size-4" aria-hidden="true" /></span>
                            <div><p className="font-semibold">{row.record}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.coverage}</p></div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Label className="sr-only" htmlFor={`retention-desktop-${row.field}`}>{tenantT(`policy.fields.${row.field}`)}</Label>
                          <Input
                            id={`retention-desktop-${row.field}`}
                            className="max-w-48"
                            type="number"
                            min={1}
                            disabled={settings.plan === 'free'}
                            value={row.days}
                            onChange={(event) => updatePolicy(row.field, Number(event.target.value))}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">{windowDescription}</p>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex items-start gap-2 text-sm leading-5">
                            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${row.key === 'audit' ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                            <span>{row.expiry}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-4 border-t p-4 sm:p-5">
              <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${settings.plan === 'paid' ? 'bg-violet-500/10 text-violet-700' : 'bg-blue-500/10 text-blue-700'}`}>{settings.plan === 'paid' ? <Archive className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}</span>
                <div><p className="font-medium">{settings.plan === 'paid' ? t('policy.paidTitle') : t('policy.freeTitle')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{settings.plan === 'paid' ? tenantT('policy.retentionConfigurable') : tenantT('policy.retentionFixed')}</p></div>
              </div>
              {policySaved && <p className="text-sm text-muted-foreground" role="status">{policySaved}</p>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={settings.plan === 'free' || !policyDirty || policySaving} onClick={() => void savePolicy()}>{policySaving ? tenantT('saving') : tenantT('save')}</Button>
                <Button variant="outline" disabled={!policyDirty || policySaving} onClick={() => { setPolicyDraft(settings.retentionPolicy); setPolicySaved(null); }}>{tenantT('discard')}</Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{tenantT('policy.description')}</p>
            </div>
          </CardContent>
        </Card>
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
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-3"><span className="card-icon"><History className="size-5" aria-hidden="true" /></span>{t('history.title')}</CardTitle><CardDescription>{t('history.description')}</CardDescription></CardHeader>
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
      <div className="hidden md:block">
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
