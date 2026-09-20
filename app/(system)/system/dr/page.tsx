'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { DatabaseBackup, FileCheck2, RotateCcw, TimerReset } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shell/PageHeader';
import { api, toApiError } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/types';

type DrStatus = components['schemas']['DrStatus'];
type DrPatch = NonNullable<paths['/system/dr/status']['patch']['requestBody']>['content']['application/json'];

type DrForm = {
  provider: string;
  backupsEnabled: boolean;
  lastBackupAt: string;
  lastRestoreDrillAt: string;
  lastRestoreDrillOutcome: '' | 'passed' | 'failed';
  evidenceRef: string;
  rpoHours: string;
  rtoHours: string;
};

const EMPTY_FORM: DrForm = { provider: '', backupsEnabled: false, lastBackupAt: '', lastRestoreDrillAt: '', lastRestoreDrillOutcome: '', evidenceRef: '', rpoHours: '1', rtoHours: '4' };
const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toForm(status: DrStatus): DrForm {
  return {
    provider: status.provider ?? '',
    backupsEnabled: status.backupsEnabled,
    lastBackupAt: toLocalDateTime(status.lastBackupAt),
    lastRestoreDrillAt: toLocalDateTime(status.lastRestoreDrillAt),
    lastRestoreDrillOutcome: status.lastRestoreDrillOutcome ?? '',
    evidenceRef: status.evidenceRef ?? '',
    rpoHours: String(status.targets.rpoHours),
    rtoHours: String(status.targets.rtoHours),
  };
}

function formatDate(value: string | null, locale: string, notRecorded: string) {
  return value ? new Date(value).toLocaleString(locale) : notRecorded;
}

function safeEvidenceHref(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function errorMessage(result: { error?: unknown }) {
  return toApiError(result.error).message;
}

/** Operator evidence register for recovery readiness. Values are attestations, never live provider telemetry (NFR-06). */
export default function DisasterRecoveryPage() {
  const locale = useLocale();
  const t = useTranslations('system.dr');
  const [status, setStatus] = useState<DrStatus | null>(null);
  const [form, setForm] = useState<DrForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api.GET('/system/dr/status');
    setLoading(false);
    if (!result.data) {
      setError(errorMessage(result as { error?: unknown }));
      return;
    }
    setStatus(result.data.data);
    setForm(toForm(result.data.data));
    setAttested(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const original = status ? toForm(status) : null;
  const targetsDirty = Boolean(status?.targetsConfigurable && original && (form.rpoHours !== original.rpoHours || form.rtoHours !== original.rtoHours));
  const evidenceDirty = Boolean(
    original &&
      (form.provider !== original.provider ||
        form.backupsEnabled !== original.backupsEnabled ||
        form.lastBackupAt !== original.lastBackupAt ||
        form.lastRestoreDrillAt !== original.lastRestoreDrillAt ||
        form.lastRestoreDrillOutcome !== original.lastRestoreDrillOutcome ||
        form.evidenceRef !== original.evidenceRef),
  );
  const dirty = evidenceDirty || targetsDirty;

  function updateForm(next: Partial<DrForm>) {
    setForm((current) => ({ ...current, ...next }));
    setAttested(false);
    setError(null);
    setSaved(null);
  }

  function buildPatch(): DrPatch | null {
    if (!status) return null;
    const original = toForm(status);
    const patch: DrPatch = {};
    const provider = form.provider.trim();
    if (form.provider !== original.provider) {
      if (provider.length < 2) {
        setError(t('validation.provider'));
        return null;
      }
      patch.provider = provider;
    }
    if (form.backupsEnabled !== original.backupsEnabled) patch.backupsEnabled = form.backupsEnabled;
    if (form.lastBackupAt !== original.lastBackupAt) {
      if (!form.lastBackupAt) {
        setError(t('validation.backupTimestamp'));
        return null;
      }
      patch.lastBackupAt = new Date(form.lastBackupAt).toISOString();
    }
    if (form.lastRestoreDrillAt !== original.lastRestoreDrillAt) {
      if (!form.lastRestoreDrillAt) {
        setError(t('validation.drillTimestamp'));
        return null;
      }
      patch.lastRestoreDrillAt = new Date(form.lastRestoreDrillAt).toISOString();
    }
    if (form.lastRestoreDrillOutcome !== original.lastRestoreDrillOutcome) {
      if (!form.lastRestoreDrillOutcome) {
        setError(t('validation.outcome'));
        return null;
      }
      patch.lastRestoreDrillOutcome = form.lastRestoreDrillOutcome;
    }
    if (form.evidenceRef.trim() !== original.evidenceRef) {
      const evidenceRef = form.evidenceRef.trim();
      if (evidenceRef && !safeEvidenceHref(evidenceRef)) {
        setError(t('validation.evidenceUrl'));
        return null;
      }
      patch.evidenceRef = evidenceRef || null;
    }
    if (status.targetsConfigurable) {
      const targets: NonNullable<DrPatch['targets']> = {};
      if (form.rpoHours !== original.rpoHours) {
        const rpoHours = Number(form.rpoHours);
        if (!Number.isFinite(rpoHours) || rpoHours <= 0 || rpoHours > 1) {
          setError(t('validation.targetRange', { target: t('targets.rpo'), max: 1 }));
          return null;
        }
        targets.rpoHours = rpoHours;
      }
      if (form.rtoHours !== original.rtoHours) {
        const rtoHours = Number(form.rtoHours);
        if (!Number.isFinite(rtoHours) || rtoHours <= 0 || rtoHours > 4) {
          setError(t('validation.targetRange', { target: t('targets.rto'), max: 4 }));
          return null;
        }
        targets.rtoHours = rtoHours;
      }
      if (Object.keys(targets).length > 0) patch.targets = targets;
    }
    return patch;
  }

  async function save() {
    if (evidenceDirty && !attested) {
      setError(t('validation.attestation'));
      return;
    }
    const patch = buildPatch();
    if (!patch || Object.keys(patch).length === 0) return;
    setSaving(true);
    setError(null);
    const result = await api.PATCH('/system/dr/status', { body: patch });
    setSaving(false);
    if (!result.data) {
      setError(errorMessage(result as { error?: unknown }));
      return;
    }
    setStatus(result.data.data);
    setForm(toForm(result.data.data));
    setAttested(false);
    setSaved(evidenceDirty ? t('saved') : t('targets.saved'));
  }

  if (loading && !status) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if (!status) {
    return (
      <div className="max-w-lg rounded-md border border-destructive/40 bg-destructive/5 p-3" role="alert">
        <p className="text-sm text-destructive">{error ?? t('loadFailed')}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>{t('retry')}</Button>
      </div>
    );
  }

  const checks = [
    { label: t('checks.backup', { hours: status.targets.backupFrequencyHours }), pass: status.checks.backupFresh },
    { label: t('checks.drill', { days: status.targets.drillFrequencyDays }), pass: status.checks.drillCurrent },
    { label: t('checks.evidence'), pass: status.checks.externalEvidenceRecorded },
  ];
  const evidenceHref = safeEvidenceHref(status.evidenceRef);

  return (
    <div className="page-shell">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['NFR-06']}
        actions={
          <Badge className="px-3 py-1" variant={status.readiness === 'ready' ? 'outline' : 'destructive'}>{status.readiness === 'ready' ? t('readiness.ready') : t('readiness.attention')}</Badge>
        }
      />

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <span className="font-medium">{t('operatorNotice.title')}:</span> {t('operatorNotice.description')}
      </div>

      {/* The first two cards are policy targets; the final two are operator-recorded recovery evidence. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          { key: 'rto', icon: TimerReset, tile: 'bg-blue-500/10 text-blue-700', value: t('targets.hours', { value: status.targets.rtoHours }), label: t('targets.rto') },
          { key: 'rpo', icon: RotateCcw, tile: 'bg-emerald-500/10 text-emerald-700', value: t('targets.hours', { value: status.targets.rpoHours }), label: t('targets.rpo') },
          { key: 'backup', icon: DatabaseBackup, tile: 'bg-violet-500/10 text-violet-700', value: formatDate(status.lastBackupAt, locale, t('notRecorded')), label: t('form.latestBackup') },
          { key: 'drill', icon: FileCheck2, tile: 'bg-amber-500/10 text-amber-700', value: formatDate(status.lastRestoreDrillAt, locale, t('notRecorded')), label: t('form.latestDrill') },
        ] as const).map((target) => {
          const Icon = target.icon;
          return (
            <div key={target.key} data-testid={`dr-summary-${target.key}`} className="flex items-center gap-3.5 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(15,35,65,0.05)]">
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${target.tile}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className={`${target.key === 'backup' || target.key === 'drill' ? 'truncate text-base font-bold tracking-[-0.02em]' : 'metric-value'}`} title={target.value}>{target.value}</p>
                <p className="text-sm text-muted-foreground">{target.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {checks.map((check) => (
          <Card key={check.label} size="sm">
            <CardHeader>
              <CardTitle>{check.pass ? t('checks.pass') : t('checks.needsEvidence')}</CardTitle>
              <CardDescription>{check.label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3"><span className="card-icon"><DatabaseBackup className="size-5" aria-hidden="true" /></span>{t('current.title')}</CardTitle>
          <CardDescription>
            {t('current.backup', { date: formatDate(status.lastBackupAt, locale, t('notRecorded')) })} · {t('current.drill', { date: formatDate(status.lastRestoreDrillAt, locale, t('notRecorded')) })}
            {status.updatedAt ? ` · ${t('current.updated', { date: formatDate(status.updatedAt, locale, t('notRecorded')) })}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evidenceHref ? (
            <a className="text-sm text-primary underline underline-offset-4" href={evidenceHref} target="_blank" rel="noreferrer">{t('current.openEvidence')}</a>
          ) : (
            <p className="text-sm text-muted-foreground">{status.evidenceRef ? t('current.unsafeLink') : t('current.noLink')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-3"><span className="card-icon"><FileCheck2 className="size-5" aria-hidden="true" /></span>{t('form.title')}</CardTitle><CardDescription>{t('form.description')}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
        <section className="rounded-xl border bg-muted/25 p-4" aria-labelledby="dr-target-policy-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="dr-target-policy-title" className="text-sm font-semibold">{t('targets.policyTitle')}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                {status.targetsConfigurable ? t('targets.paidDescription') : t('targets.freeDescription')}
              </p>
            </div>
            <Badge variant="outline">{status.targetsConfigurable ? t('targets.paidBadge') : t('targets.fixedBadge')}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="dr-rpo-hours">{t('targets.rpo')}</Label>
              <div className="relative">
                <Input
                  id="dr-rpo-hours"
                  type="number"
                  min="0"
                  max="1"
                  step="any"
                  disabled={!status.targetsConfigurable}
                  value={form.rpoHours}
                  onChange={(event) => updateForm({ rpoHours: event.target.value })}
                  className="pr-14"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{t('targets.hourUnit')}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dr-rto-hours">{t('targets.rto')}</Label>
              <div className="relative">
                <Input
                  id="dr-rto-hours"
                  type="number"
                  min="0"
                  max="4"
                  step="any"
                  disabled={!status.targetsConfigurable}
                  value={form.rtoHours}
                  onChange={(event) => updateForm({ rtoHours: event.target.value })}
                  className="pr-14"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{t('targets.hourUnit')}</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{t('targets.evidenceBoundary')}</p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="dr-provider">{t('form.provider')}</Label>
            <Input id="dr-provider" placeholder="MongoDB Atlas" value={form.provider} onChange={(event) => updateForm({ provider: event.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dr-evidence">{t('form.evidenceUrl')}</Label>
            <Input id="dr-evidence" type="url" placeholder="https://…" value={form.evidenceRef} onChange={(event) => updateForm({ evidenceRef: event.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dr-backup-at">{t('form.latestBackup')}</Label>
            <Input id="dr-backup-at" type="datetime-local" value={form.lastBackupAt} onChange={(event) => updateForm({ lastBackupAt: event.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dr-drill-at">{t('form.latestDrill')}</Label>
            <Input id="dr-drill-at" type="datetime-local" value={form.lastRestoreDrillAt} onChange={(event) => updateForm({ lastRestoreDrillAt: event.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dr-drill-outcome">{t('form.outcome')}</Label>
            <select id="dr-drill-outcome" className={selectClassName} value={form.lastRestoreDrillOutcome} onChange={(event) => updateForm({ lastRestoreDrillOutcome: event.target.value as DrForm['lastRestoreDrillOutcome'] })}>
              <option value="">{t('notRecorded')}</option>
              <option value="passed">{t('outcomes.passed')}</option>
              <option value="failed">{t('outcomes.failed')}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end rounded-md border p-2 text-sm">
            <input type="checkbox" checked={form.backupsEnabled} onChange={(event) => updateForm({ backupsEnabled: event.target.checked })} />
            {t('form.backupsEnabled')}
          </label>
        </div>

        {evidenceDirty && (
          <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <input className="mt-0.5" type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
            {t('form.attestation')}
          </label>
        )}
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{error}</p>}
        {saved && <p className="text-sm text-muted-foreground" role="status">{saved}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={!dirty || (evidenceDirty && !attested) || saving}>{saving ? t('saving') : evidenceDirty ? t('save') : t('targets.save')}</Button>
          <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => { setForm(toForm(status)); setAttested(false); setError(null); }}>{t('discard')}</Button>
        </div>
        </CardContent>
      </form>
      </Card>
    </div>
  );
}
