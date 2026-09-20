'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Eye, FileClock, GitCompareArrows, History, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { auditApi, type Reconstruction } from '@/lib/audit';
import { toApiError } from '@/lib/api/client';
import { formatDisplayValue, formatIdentifierLabel, formatIdentifierTokensInText } from '@/lib/format-identifier-label';

/**
 * FR-26: what the audit log alone says happened to an assessment — timeline, rebuilt state, per-entry hash
 * integrity (SEC-07) and the diff against the stored document (FR-30). Read-only.
 */
export function ReconstructionView({ id }: { id: string }) {
  const locale = useLocale();
  const t = useTranslations('reconstruction');
  const resultCard = useTranslations('resultCard');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const [r, setR] = useState<Reconstruction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unmask, setUnmask] = useState(false); // SEC-05

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    auditApi
      .reconstruct(id, unmask)
      .then((x) => !cancelled && setR(x))
      .catch((e) => !cancelled && setError(toApiError(e).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, unmask]);

  if (error) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {error}
      </div>
    );
  }
  if (!r) {
    return (
      <div role="status" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border bg-muted/20 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        {t('loading')}
      </div>
    );
  }
  const s = r.state;

  return (
    <div className={`space-y-4 text-sm transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      <section className="grid gap-3 md:grid-cols-3">
        <div className={`rounded-xl border p-4 ${r.integrity.ok ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/30 dark:bg-emerald-400/10' : 'border-destructive/25 bg-destructive/5'}`}>
          <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-background shadow-sm">
            {r.integrity.ok ? <ShieldCheck aria-hidden="true" className="size-4 text-emerald-700 dark:text-emerald-300" /> : <ShieldAlert aria-hidden="true" className="size-4 text-destructive" />}
          </div>
          <div className="font-medium leading-5">{r.integrity.ok ? t('integrity.verified', { count: r.integrity.checked }) : t('integrity.tampered', { sequences: r.integrity.badSeqs.join(', ') })}</div>
        </div>
        <div className="rounded-xl border bg-muted/15 p-4">
          <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-background shadow-sm">
            <FileClock aria-hidden="true" className="size-4 text-primary" />
          </div>
          <div className="font-medium leading-5">{r.completeness === 'full' ? t('completeness.full') : r.completeness === 'partial' ? t('completeness.partial', { plan: r.plan.toUpperCase() }) : t('completeness.none')}</div>
        </div>
        <div className={`rounded-xl border p-4 ${r.conformance.matches ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/30 dark:bg-emerald-400/10' : 'border-destructive/25 bg-destructive/5'}`}>
          <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-background shadow-sm">
            {r.conformance.matches ? <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-700 dark:text-emerald-300" /> : <GitCompareArrows aria-hidden="true" className="size-4 text-destructive" />}
          </div>
          <div className="font-medium leading-5">{r.conformance.matches ? t('conformance.matches') : t('conformance.differences', { count: r.conformance.differences.length })}</div>
        </div>
      </section>
      {r.missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
          {t('missing', { fields: r.missing.join(', ') })}
        </div>
      )}
      {r.masked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <span className="flex items-start gap-2 leading-5">
            <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
            {t('masked', { plan: r.masked.toUpperCase() })}
          </span>
          <Button type="button" size="sm" variant="outline" className="border-amber-300 bg-background/80 dark:border-amber-400/35" disabled={loading || unmask} onClick={() => setUnmask(true)}>
            {t('unmask')}
          </Button>
        </div>
      )}
      {!r.conformance.matches && (
        <section className="overflow-hidden rounded-xl border border-destructive/30">
          <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-3 font-medium text-destructive">
            <GitCompareArrows aria-hidden="true" className="size-4" />
            {t('difference.title')}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-xs">
              <thead>
                <tr className="bg-muted/25 text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{t('difference.field')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('difference.fromAudit')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('difference.stored')}</th>
                </tr>
              </thead>
              <tbody>
                {r.conformance.differences.map((d) => (
                  <tr key={d.field} className="border-t">
                    <td className="px-4 py-3 font-mono">{d.field}</td>
                    <td className="max-w-72 whitespace-normal px-4 py-3 font-mono text-[11px]">{JSON.stringify(d.fromAudit)}</td>
                    <td className="max-w-72 whitespace-normal px-4 py-3 font-mono text-[11px]">{JSON.stringify(d.stored)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/25 px-4 py-3 font-medium">{t('state.status')}</div>
        <div className="grid gap-px bg-border sm:grid-cols-2">
          <div className="bg-card p-4">
            <div className="text-xs text-muted-foreground">{t('state.personaScenario')}</div>
            <div className="mt-1 font-medium">{s.personaKey ? formatIdentifierLabel(s.personaKey) : '—'} / {s.scenarioKey ? formatIdentifierLabel(s.scenarioKey) : '—'}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-xs text-muted-foreground">{t('state.status')}</div>
            <div className="mt-1"><Badge variant="outline">{s.status && status.has(s.status) ? status(s.status) : s.status ? formatIdentifierLabel(s.status) : '—'}</Badge></div>
          </div>
          <div className="bg-card p-4">
            <div className="text-xs text-muted-foreground">{t('state.scoreClass')}</div>
            <div className="mt-1 font-medium tabular-nums">
              {s.score ?? '—'} → {s.classification && classification.has(s.classification)
                ? classification(s.classification)
                : s.classification
                  ? formatIdentifierLabel(s.classification)
                  : s.computedClassification
                    ? formatIdentifierLabel(s.computedClassification)
                    : '—'}
              {s.ruleDriven ? ` ${t('state.ruleDrivenSuffix')}` : ''}
            </div>
          </div>
          <div className="bg-card p-4">
            <div className="text-xs text-muted-foreground">{t('state.confidence')}</div>
            <div className="mt-1 font-medium tabular-nums">{s.confidence ?? '—'}%{s.recommendedAction ? ` · ${s.recommendedAction}` : ''}</div>
          </div>
          {s.versions && (
            <div className="bg-card p-4 sm:col-span-2">
              <div className="text-xs text-muted-foreground">{t('state.pinnedVersions')}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(s.versions).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="font-mono text-[11px]">
                    {key}={typeof value === 'object' && value ? `${(value as { version?: number }).version ?? '?'}` : String(value)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {s.explanation && <p className="bg-card p-4 leading-6 sm:col-span-2">{s.explanation}</p>}
        </div>
      </section>
      {Object.keys(s.facts).length > 0 && (
        <details className="overflow-hidden rounded-xl border text-xs" open>
          <summary className="cursor-pointer bg-muted/25 px-4 py-3 font-medium text-foreground">{t('facts', { count: Object.keys(s.facts).length })}</summary>
          <div className="overflow-x-auto px-4 pb-2">
            <table className="w-full min-w-[30rem]">
              <tbody>
                {Object.entries(s.facts).map(([key, value]) => (
                  <tr key={key} className="border-b last:border-0">
                    <td className="py-3 pr-4 text-xs font-medium text-muted-foreground">{formatIdentifierLabel(key)}</td>
                    <td className="max-w-xl whitespace-normal py-3 font-medium">{formatDisplayValue(value, resultCard('yes'), resultCard('no'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <section className="overflow-hidden rounded-xl border">
        <div className="flex items-center gap-2 border-b bg-muted/25 px-4 py-3 font-medium">
          <History aria-hidden="true" className="size-4 text-primary" />
          {t('timeline', { count: r.timeline.length })}
        </div>
        <ol className="px-4 py-2 text-xs">
          {r.timeline.map((entry, index) => (
            <li key={entry.seq} className={`relative grid gap-1 border-b py-3 pl-8 last:border-0 sm:grid-cols-[8rem_9rem_1fr] sm:gap-3 ${r.integrity.badSeqs.includes(entry.seq) ? 'text-destructive' : ''}`}>
              <span aria-hidden="true" className={`absolute left-1.5 top-4 size-2.5 rounded-full ring-4 ring-background ${r.integrity.badSeqs.includes(entry.seq) ? 'bg-destructive' : 'bg-primary'}`} />
              {index < r.timeline.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[10px] top-6 w-px bg-border" />}
              <span className="font-mono text-muted-foreground">#{entry.seq} · {entry.at ? new Date(entry.at).toLocaleString(locale) : '—'}</span>
              <span className="text-muted-foreground">{formatIdentifierLabel(entry.actor.role ?? 'system')}</span>
              <span className="leading-5 text-foreground">{formatIdentifierTokensInText(entry.summary)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
