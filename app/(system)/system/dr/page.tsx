'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
};

const EMPTY_FORM: DrForm = { provider: '', backupsEnabled: false, lastBackupAt: '', lastRestoreDrillAt: '', lastRestoreDrillOutcome: '', evidenceRef: '' };
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

  const dirty = Boolean(status && JSON.stringify(form) !== JSON.stringify(toForm(status)));

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
    return patch;
  }

  async function save() {
    if (!attested) {
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
    setSaved(t('saved'));
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
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Badge variant={status.readiness === 'ready' ? 'outline' : 'destructive'}>{status.readiness === 'ready' ? t('readiness.ready') : t('readiness.attention')}</Badge>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
        <span className="font-medium">{t('operatorNotice.title')}:</span> {t('operatorNotice.description')}
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
          <CardTitle>{t('current.title')}</CardTitle>
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

      <form
        className="space-y-4 rounded-md border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div>
          <h2 className="font-medium">{t('form.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('form.description')}</p>
        </div>
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

        {dirty && (
          <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <input className="mt-0.5" type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
            {t('form.attestation')}
          </label>
        )}
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{error}</p>}
        {saved && <p className="text-sm text-muted-foreground" role="status">{saved}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={!dirty || !attested || saving}>{saving ? t('saving') : t('save')}</Button>
          <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => { setForm(toForm(status)); setAttested(false); setError(null); }}>{t('discard')}</Button>
        </div>
      </form>
    </div>
  );
}
