'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, Building2, Database, KeyRound, LockKeyhole, Settings2, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="page-shell max-w-6xl">
      <header className="workspace-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><Settings2 className="size-4" aria-hidden="true" />{t('eyebrow')}</div>
            <h1 className="page-heading">{t('title')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{merged.name} · <code>{merged.slug}</code></p>
          </div>
          <Badge variant={merged.plan === 'paid' ? 'default' : 'secondary'} className="px-3 py-1">{merged.plan.toUpperCase()}</Badge>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-primary" aria-hidden="true" />{t('plan.title')}</CardTitle>
          <CardDescription>{merged.plan === 'paid' ? t('plan.paidDescription') : t('plan.freeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
        <div className="inline-flex rounded-xl border bg-muted/30 p-1">
          {(['free', 'paid'] as const).map((p) => (
            <Button key={p} size="sm" variant={merged.plan === p ? 'default' : 'ghost'} onClick={() => setDraft((d) => ({ ...d, plan: p, ...(p === 'free' ? { retentionPolicy: undefined } : {}) }))}>
              {p.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <label key={feature} className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3 text-sm transition-colors hover:bg-muted/40">
              <input type="checkbox" className="mt-1" checked={Boolean(merged.features[feature])} onChange={(e) => setDraft((d) => ({ ...d, features: { ...(d.features ?? {}), [feature]: e.target.checked } }))} />
              <span>
                <span className="font-medium">{t(`features.${feature}.label`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`features.${feature}.hint`)}</span>
              </span>
            </label>
          ))}
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><KeyRound className="size-4 text-primary" aria-hidden="true" />{t('sso.title')}</CardTitle>
          <CardDescription>{t('sso.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
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
        <div className={`rounded-xl border p-3 text-sm ${merged.plan === 'paid' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-blue-500/30 bg-blue-500/5'}`}>
          <div className="flex items-start gap-2">
            <BadgeCheck className={`mt-0.5 size-4 shrink-0 ${merged.plan === 'paid' ? 'text-emerald-700' : 'text-blue-700'}`} aria-hidden="true" />
            <div><p className="font-medium">{merged.plan === 'paid' ? t('mfaPolicy.paidTitle') : t('mfaPolicy.freeTitle')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{merged.plan === 'paid' ? t('mfaPolicy.paidDescription') : t('mfaPolicy.freeDescription')}</p></div>
          </div>
        </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><LockKeyhole className="size-4 text-primary" aria-hidden="true" />{t('policy.title')}</CardTitle>
          <CardDescription>{t('policy.accountSemantics')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="idle">{t('policy.idleTimeout')}</Label>
            <Input id="idle" type="number" min={5} max={30} value={merged.sessionPolicy.idleTimeoutMin} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), idleTimeoutMin: Number(e.target.value) } }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max">{t('policy.maxSessions')}</Label>
            <Input id="max" type="number" min={1} max={10} value={merged.sessionPolicy.maxConcurrentSessions} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), maxConcurrentSessions: Number(e.target.value) } }))} />
            <p className="text-xs leading-5 text-muted-foreground"><UsersRound className="mr-1 inline size-3.5" aria-hidden="true" />{t('policy.sessionSemantics')}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="mb-4 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Database className="size-4" aria-hidden="true" /></span>
            <div><h2 className="font-medium">{t('policy.retentionTitle')}</h2><p id="retention-mode-hint" className="mt-1 text-xs leading-5 text-muted-foreground">{merged.plan === 'free' ? t('policy.retentionFixed') : t('policy.retentionConfigurable')}</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
          {RETENTION_FIELDS.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k}>{t(`policy.fields.${k}`)}</Label>
              <Input id={k} type="number" min={1} aria-describedby={k === 'datasetHistoryDays' ? 'dataset-history-semantics retention-mode-hint' : 'retention-mode-hint'} disabled={merged.plan === 'free'} value={merged.retentionPolicy[k]} onChange={(e) => setDraft((d) => ({ ...d, retentionPolicy: { ...(d.retentionPolicy ?? {}), [k]: Number(e.target.value) } }))} />
              {k === 'datasetHistoryDays' && <p id="dataset-history-semantics" className="text-xs leading-5 text-muted-foreground">{t('policy.datasetHistorySemantics')}</p>}
            </div>
          ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('policy.description')}</p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground">{saved}</p>}
      <div className="sticky bottom-4 z-10 flex w-fit gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
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
