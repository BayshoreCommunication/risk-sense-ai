'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { auditApi, type Reconstruction } from '@/lib/audit';
import { toApiError } from '@/lib/api/client';

/**
 * FR-26: what the audit log alone says happened to an assessment — timeline, rebuilt state, per-entry hash
 * integrity (SEC-07) and the diff against the stored document (FR-30). Read-only.
 */
export function ReconstructionView({ id }: { id: string }) {
  const locale = useLocale();
  const t = useTranslations('reconstruction');
  const [r, setR] = useState<Reconstruction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unmask, setUnmask] = useState(false); // SEC-05

  useEffect(() => {
    let cancelled = false;
    auditApi
      .reconstruct(id, unmask)
      .then((x) => !cancelled && setR(x))
      .catch((e) => !cancelled && setError(toApiError(e).message));
    return () => {
      cancelled = true;
    };
  }, [id, unmask]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!r) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const s = r.state;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.integrity.ok ? 'outline' : 'destructive'}>{r.integrity.ok ? t('integrity.verified', { count: r.integrity.checked }) : t('integrity.tampered', { sequences: r.integrity.badSeqs.join(', ') })}</Badge>
        <Badge variant={r.completeness === 'full' ? 'outline' : 'secondary'}>{r.completeness === 'full' ? t('completeness.full') : r.completeness === 'partial' ? t('completeness.partial', { plan: r.plan.toUpperCase() }) : t('completeness.none')}</Badge>
        <Badge variant={r.conformance.matches ? 'outline' : 'destructive'}>{r.conformance.matches ? t('conformance.matches') : t('conformance.differences', { count: r.conformance.differences.length })}</Badge>
      </div>
      {r.missing.length > 0 && <p className="text-xs text-muted-foreground">{t('missing', { fields: r.missing.join(', ') })}</p>}
      {r.masked && (
        <p className="text-xs text-muted-foreground">
          {t('masked', { plan: r.masked.toUpperCase() })}{' '}
          <button type="button" className="underline" onClick={() => setUnmask(true)}>
            {t('unmask')}
          </button>
        </p>
      )}
      {!r.conformance.matches && (
        <div className="rounded-md border border-destructive/40 p-3">
          <div className="mb-1 font-medium">{t('difference.title')}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pr-2">{t('difference.field')}</th>
                <th className="pr-2">{t('difference.fromAudit')}</th>
                <th>{t('difference.stored')}</th>
              </tr>
            </thead>
            <tbody>
              {r.conformance.differences.map((d) => (
                <tr key={d.field} className="border-t">
                  <td className="py-1 pr-2 font-mono">{d.field}</td>
                  <td className="py-1 pr-2">{JSON.stringify(d.fromAudit)}</td>
                  <td className="py-1">{JSON.stringify(d.stored)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">{t('state.personaScenario')}:</span> {s.personaKey ?? '—'} / {s.scenarioKey ?? '—'}
        </div>
        <div>
          <span className="text-muted-foreground">{t('state.status')}:</span> {s.status}
        </div>
        <div>
          <span className="text-muted-foreground">{t('state.scoreClass')}:</span> {s.score ?? '—'} → {s.classification ?? s.computedClassification ?? '—'}
          {s.ruleDriven ? ` ${t('state.ruleDrivenSuffix')}` : ''}
        </div>
        <div>
          <span className="text-muted-foreground">{t('state.confidence')}:</span> {s.confidence ?? '—'}%{s.recommendedAction ? ` · ${s.recommendedAction}` : ''}
        </div>
        {s.versions && (
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            {t('state.pinnedVersions')}: {Object.entries(s.versions).map(([k, v]) => `${k}=${typeof v === 'object' && v ? `${(v as { version?: number }).version ?? '?'}` : String(v)}`).join(' · ')}
          </div>
        )}
        {s.explanation && <p className="sm:col-span-2">{s.explanation}</p>}
      </div>
      {Object.keys(s.facts).length > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer font-medium">{t('facts', { count: Object.keys(s.facts).length })}</summary>
          <table className="mt-1 w-full">
            <tbody>
              {Object.entries(s.facts).map(([k, v]) => (
                <tr key={k} className="border-t">
                  <td className="py-1 pr-2 font-mono">{k}</td>
                  <td className="py-1">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <div>
        <div className="mb-1 font-medium">{t('timeline', { count: r.timeline.length })}</div>
        <ol className="space-y-1 text-xs">
          {r.timeline.map((t) => (
            <li key={t.seq} className={`flex gap-2 ${r.integrity.badSeqs.includes(t.seq) ? 'text-destructive' : ''}`}>
              <span className="w-10 shrink-0 font-mono text-muted-foreground">#{t.seq}</span>
              <span className="w-36 shrink-0 text-muted-foreground">{t.at ? new Date(t.at).toLocaleString(locale) : '—'}</span>
              <span className="w-40 shrink-0 text-muted-foreground">{t.actor.role ?? 'system'}</span>
              <span>{t.summary}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
