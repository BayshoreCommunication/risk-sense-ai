'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, Building2, KeyRound, LockKeyhole, Shapes, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shell/PageHeader';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';

type Settings = components['schemas']['TenantSettings'];
type Patch = NonNullable<import('@/lib/api/types').paths['/system/tenant']['patch']['requestBody']>['content']['application/json'];

const FEATURES: (keyof Settings['features'])[] = ['sso', 'reviewDashboard', 'reports', 'fullAudit', 'departmentMapping', 'blockConcurrentLogin'];

/** System administrator: tenant plan, features, SSO (FR-03), and auth/session policy (SEC-02). Every save is audited. */
export default function TenantSettingsPage() {
  const locale = useLocale();
  const t = useTranslations('system.tenant');
  const [s, setS] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Patch>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [sectorText, setSectorText] = useState('');

  useEffect(() => {
    api.GET('/system/tenant').then((r) => {
      if (!r.data) return setError(toApiError((r as { error?: unknown }).error).message);
      setS(r.data.data);
      setSectorText((r.data.data.sectors ?? []).join('; '));
    });
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
    setSectorText(r.data.data.sectors.join('; '));
    setDraft({});
    setSaved(t('saved', { time: new Date().toLocaleTimeString(locale) }));
  }

  if (!merged) return <p className="text-sm text-muted-foreground">{error ?? t('loading')}</p>;
  const dirty = Object.keys(draft).length > 0;
  return (
    <div className="page-shell max-w-7xl">
      <PageHeader
        title={t('title')}
        description={
          <>
            {t('description')}
            <span className="mt-1 block">{merged.name} · <code>{merged.slug}</code></span>
          </>
        }
        requirements={['FR-03', 'SEC-02']}
      />

      <Card className="overflow-hidden shadow-[0_10px_30px_rgba(15,35,65,0.06)]">
        <CardContent className="divide-y p-0">
          <section className="space-y-5 p-4 sm:p-6" aria-labelledby="identity-provider-title">
            <div className="flex items-start gap-3">
              <span className="card-icon"><KeyRound className="size-5" aria-hidden="true" /></span>
              <div>
                <h2 id="identity-provider-title" className="font-heading text-base font-bold tracking-[-0.01em]">{t('sso.title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('sso.description')}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="providerId">{t('sso.providerId')}</Label>
                <Input id="providerId" placeholder="microsoft.com / oidc.acme / saml.acme" value={merged.sso.providerId ?? ''} onChange={(e) => setDraft((d) => ({ ...d, sso: { providerId: e.target.value || null, domain: (d.sso?.domain ?? merged.sso.domain) || null } }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="domain">{t('sso.domain')}</Label>
                <Input id="domain" placeholder="acme.com" value={merged.sso.domain ?? ''} onChange={(e) => setDraft((d) => ({ ...d, sso: { providerId: (d.sso?.providerId ?? merged.sso.providerId) || null, domain: e.target.value || null } }))} />
              </div>
            </div>
            <div className={`rounded-xl border p-3 text-sm ${merged.plan === 'paid' ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-400/10' : 'border-blue-500/30 bg-blue-500/5 dark:bg-blue-400/10'}`}>
              <div className="flex items-start gap-2">
                <BadgeCheck className={`mt-0.5 size-4 shrink-0 ${merged.plan === 'paid' ? 'text-emerald-700 dark:text-emerald-300' : 'text-blue-700 dark:text-blue-300'}`} aria-hidden="true" />
                <div><p className="font-medium">{merged.plan === 'paid' ? t('mfaPolicy.paidTitle') : t('mfaPolicy.freeTitle')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{merged.plan === 'paid' ? t('mfaPolicy.paidDescription') : t('mfaPolicy.freeDescription')}</p></div>
              </div>
            </div>
          </section>

          <section className="space-y-5 p-4 sm:p-6" aria-labelledby="session-policy-title">
            <div className="flex items-start gap-3">
              <span className="card-icon"><LockKeyhole className="size-5" aria-hidden="true" /></span>
              <div>
                <h2 id="session-policy-title" className="font-heading text-base font-bold tracking-[-0.01em]">{t('policy.title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('policy.accountSemantics')}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="idle">{t('policy.idleTimeout')}</Label>
                <Input id="idle" type="number" min={5} max={30} value={merged.sessionPolicy.idleTimeoutMin} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), idleTimeoutMin: Number(e.target.value) } }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max">{t('policy.maxSessions')}</Label>
                <Input id="max" type="number" min={1} max={10} aria-describedby="session-semantics" value={merged.sessionPolicy.maxConcurrentSessions} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), maxConcurrentSessions: Number(e.target.value) } }))} />
                <p id="session-semantics" className="text-xs leading-5 text-muted-foreground"><UsersRound className="mr-1 inline size-3.5" aria-hidden="true" />{t('policy.sessionSemantics')}</p>
              </div>
            </div>
          </section>

          <section className="space-y-5 p-4 sm:p-6" aria-labelledby="sector-vocabulary-title">
            <div className="flex items-start gap-3">
              <span className="card-icon"><Shapes className="size-5" aria-hidden="true" /></span>
              <div>
                <h2 id="sector-vocabulary-title" className="font-heading text-base font-bold tracking-[-0.01em]">{t('sectors.title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('sectors.description')}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sector-vocabulary">{t('sectors.label')}</Label>
              <Input
                id="sector-vocabulary"
                value={sectorText}
                placeholder="financial; healthcare; it"
                aria-describedby="sector-vocabulary-help"
                onChange={(event) => {
                  const value = event.target.value;
                  setSectorText(value);
                  setDraft((current) => ({
                    ...current,
                    sectors: value.split(';').map((sector) => sector.trim().toLowerCase()).filter(Boolean),
                  }));
                }}
              />
              <p id="sector-vocabulary-help" className="text-xs leading-5 text-muted-foreground">{t('sectors.help')}</p>
            </div>
          </section>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-3"><span className="card-icon"><Building2 className="size-5" aria-hidden="true" /></span>{t('plan.title')}</CardTitle>
          <CardDescription>{merged.plan === 'paid' ? t('plan.paidDescription') : t('plan.freeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground" role="status">{saved}</p>}
      <div className="sticky bottom-0 z-10 flex justify-end gap-2 rounded-xl border bg-card p-2 shadow-[0_-6px_20px_rgba(15,35,65,0.08)]">
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? t('saving') : t('save')}
        </Button>
        <Button variant="outline" disabled={!dirty || busy} onClick={() => { setDraft({}); setSectorText(s?.sectors.join('; ') ?? ''); }}>
          {t('discard')}
        </Button>
      </div>
    </div>
  );
}
