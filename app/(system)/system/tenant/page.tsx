'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';

type Settings = components['schemas']['TenantSettings'];
type Patch = NonNullable<import('@/lib/api/types').paths['/system/tenant']['patch']['requestBody']>['content']['application/json'];

const FEATURES: { key: keyof Settings['features']; label: string; hint: string }[] = [
  { key: 'sso', label: 'Single sign-on', hint: 'FR-03 — needs a provider id and an email domain below' },
  { key: 'reviewDashboard', label: 'Review dashboard', hint: 'FR-21 — department-scoped review and escalation routing' },
  { key: 'reports', label: 'Reports & analytics', hint: 'FR-26..28 — standard reports, trends, CSV/PDF export' },
  { key: 'fullAudit', label: 'Full audit payloads', hint: 'FR-26 — lifecycle fully reconstructible from the log' },
  { key: 'departmentMapping', label: 'Department ↔ persona mapping', hint: 'FR-10' },
  { key: 'blockConcurrentLogin', label: 'Block concurrent logins', hint: 'FR-04 — reject a second session instead of superseding' },
];

/** System administrator: tenant plan, features, SSO (FR-03), auth/session policy (SEC-02), retention (SEC-06). Every save is audited. */
export default function TenantSettingsPage() {
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
    setSaved(`Saved ${new Date().toLocaleTimeString()} (audited as config/tenant.updated)`);
  }

  if (!merged) return <p className="text-sm text-muted-foreground">{error ?? 'Loading…'}</p>;
  const dirty = Object.keys(draft).length > 0;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tenant settings</h1>
        <p className="text-sm text-muted-foreground">
          {merged.name} · <code>{merged.slug}</code> · <Badge variant={merged.plan === 'paid' ? 'default' : 'secondary'}>{merged.plan.toUpperCase()}</Badge>
        </p>
      </div>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">Plan & features</h2>
        <div className="flex gap-2">
          {(['free', 'paid'] as const).map((p) => (
            <Button key={p} size="sm" variant={merged.plan === p ? 'default' : 'outline'} onClick={() => setDraft((d) => ({ ...d, plan: p }))}>
              {p.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <label key={f.key} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm">
              <input type="checkbox" className="mt-1" checked={Boolean(merged.features[f.key])} onChange={(e) => setDraft((d) => ({ ...d, features: { ...(d.features ?? {}), [f.key]: e.target.checked } }))} />
              <span>
                <span className="font-medium">{f.label}</span>
                <span className="block text-xs text-muted-foreground">{f.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">Single sign-on (FR-03)</h2>
        <p className="text-xs text-muted-foreground">
          OIDC/OAuth providers work on the Firebase free tier (`microsoft.com`, `google.com`, `oidc.&lt;id&gt;` configured in Firebase Authentication → Sign-in method). SAML (`saml.&lt;id&gt;`) needs Identity Platform — see DeploymentGuide. Users on the domain are provisioned into this tenant on first login; SSO logins skip the email OTP for non-privileged roles.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="providerId">Firebase provider id</Label>
            <Input id="providerId" placeholder="microsoft.com / oidc.acme / saml.acme" value={merged.sso.providerId ?? ''} onChange={(e) => setDraft((d) => ({ ...d, sso: { providerId: e.target.value || null, domain: (d.sso?.domain ?? merged.sso.domain) || null } }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="domain">Email domain</Label>
            <Input id="domain" placeholder="acme.com" value={merged.sso.domain ?? ''} onChange={(e) => setDraft((d) => ({ ...d, sso: { providerId: (d.sso?.providerId ?? merged.sso.providerId) || null, domain: e.target.value || null } }))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={merged.authPolicy.otpRequired} onChange={(e) => setDraft((d) => ({ ...d, authPolicy: { otpRequired: e.target.checked } }))} />
          Require the email OTP on every non-SSO login (FR-01). Administrators always get it (SEC-03).
        </label>
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">Sessions (SEC-02) & retention (SEC-06)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="idle">Idle timeout (minutes, 5–30)</Label>
            <Input id="idle" type="number" min={5} max={30} value={merged.sessionPolicy.idleTimeoutMin} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), idleTimeoutMin: Number(e.target.value) } }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max">Max concurrent sessions (1–10)</Label>
            <Input id="max" type="number" min={1} max={10} value={merged.sessionPolicy.maxConcurrentSessions} onChange={(e) => setDraft((d) => ({ ...d, sessionPolicy: { ...(d.sessionPolicy ?? {}), maxConcurrentSessions: Number(e.target.value) } }))} />
          </div>
          {(
            [
              ['assessmentDays', 'Assessments (days)'],
              ['auditDays', 'Audit log (days)'],
              ['evidenceDays', 'Evidence (days)'],
              ['datasetHistoryDays', 'Dataset history (days)'],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} type="number" min={1} value={merged.retentionPolicy[k]} onChange={(e) => setDraft((d) => ({ ...d, retentionPolicy: { ...(d.retentionPolicy ?? {}), [k]: Number(e.target.value) } }))} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">FREE: after the assessment window, records are reduced to login id, risk type, date/time and duration. PAID: archived. Enforcement runs nightly and is audited.</p>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground">{saved}</p>}
      <div className="flex gap-2">
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setDraft({})}>
          Discard
        </Button>
      </div>
    </div>
  );
}
