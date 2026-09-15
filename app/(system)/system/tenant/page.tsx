'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';

type Settings = components['schemas']['TenantSettings'];
type Patch = NonNullable<import('@/lib/api/types').paths['/system/tenant']['patch']['requestBody']>['content']['application/json'];

const FEATURES: (keyof Settings['features'])[] = ['sso', 'reviewDashboard', 'reports', 'fullAudit', 'departmentMapping', 'blockConcurrentLogin'];
const RETENTION_FIELDS = ['assessmentDays', 'auditDays', 'evidenceDays', 'datasetHistoryDays'] as const;

/** System administrator: tenant plan, features, SSO (FR-03), auth/session policy (SEC-02), retention (SEC-06). Every save is audited. */
export default function TenantSettingsPage() {
  const locale = useLocale();
  const t = useTranslations('system.tenant');
  const [s, setS] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Patch>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api.GET('/system/tenant').then((r) => (r.data ? setS(r.data.data) : setError(toApiError((r as { error?: unknown }).error).message)));
  }, []);

  const merged = s ? { ...s, ...draft, features: { ...s.features, ...(draft.features ?? {}) }, sso: { ...s.sso, ...(draft.sso ?? {}) }, authPolicy: { ...s.authPolicy, ...(draft.authPolicy ?? {}) }, sessionPolicy: { ...s.sessionPolicy, ...(draft.sessionPolicy ?? {}) }, retentionPolicy: { ...s.retentionPolicy, ...(draft.retentionPolicy ?? {}) } } : null;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    const r = await api.PATCH('/system/tenant', { body: draft });
    setBusy(false);
    if (!r.data) return setError(toApiError((r as { error?: unknown }).error).message);
    setS(r.data.data);
    setDraft({});
    setSaved(t('saved', { time: new Date().toLocaleTimeString(locale) }));
  }

  if (!merged) return <p className="text-sm text-muted-foreground">{error ?? t('loading')}</p>;
  const dirty = Object.keys(draft).length > 0;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {merged.name} · <code>{merged.slug}</code> · <Badge variant={merged.plan === 'paid' ? 'default' : 'secondary'}>{merged.plan.toUpperCase()}</Badge>
        </p>
      </div>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">{t('plan.title')}</h2>
        <div className="flex gap-2">
          {(['free', 'paid'] as const).map((p) => (
            <Button key={p} size="sm" variant={merged.plan === p ? 'default' : 'outline'} onClick={() => setDraft((d) => ({ ...d, plan: p }))}>
              {p.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <label key={feature} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm">
              <input type="checkbox" className="mt-1" checked={Boolean(merged.features[feature])} onChange={(e) => setDraft((d) => ({ ...d, features: { ...(d.features ?? {}), [feature]: e.target.checked } }))} />
              <span>
                <span className="font-medium">{t(`features.${feature}.label`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`features.${feature}.hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">{t('sso.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('sso.description')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="providerId">{t('sso.providerId')}</Label>
            <Input id="providerId" placeholder="microsoft.com / oidc.acme / saml.acme" value={merged.sso.providerId ?? ''} onChange={(e) => setDraft((d) => ({ ...d, sso: { providerId: e.target.value || null, domain: (d.sso?.domain ?? merged.sso.domain) || null } }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="domain">{t('sso.domain')}</Label>
            <Input id="domain" placeholder="acme.com" value={merged.sso.domain ?? ''} onChange={(e) => setDraft((d) => ({ ...d, sso: { providerId: (d.sso?.providerId ?? merged.sso.providerId) || null, domain: e.target.value || null } }))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={merged.authPolicy.otpRequired} onChange={(e) => setDraft((d) => ({ ...d, authPolicy: { otpRequired: e.target.checked } }))} />
          {t('sso.requireOtp')}
        </label>
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">{t('policy.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="idle">{t('policy.idleTimeout')}</Label>
            <Input id="idle" type="number" min={5} max={30} value={merged.sessionPolicy.idleTimeoutMin} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), idleTimeoutMin: Number(e.target.value) } }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max">{t('policy.maxSessions')}</Label>
            <Input id="max" type="number" min={1} max={10} value={merged.sessionPolicy.maxConcurrentSessions} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), maxConcurrentSessions: Number(e.target.value) } }))} />
          </div>
          {RETENTION_FIELDS.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k}>{t(`policy.fields.${k}`)}</Label>
              <Input id={k} type="number" min={1} value={merged.retentionPolicy[k]} onChange={(e) => setDraft((d) => ({ ...d, retentionPolicy: { ...(d.retentionPolicy ?? {}), [k]: Number(e.target.value) } }))} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('policy.description')}</p>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground">{saved}</p>}
      <div className="flex gap-2">
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? t('saving') : t('save')}
        </Button>
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setDraft({})}>
          {t('discard')}
        </Button>
      </div>
    </div>
  );
}
