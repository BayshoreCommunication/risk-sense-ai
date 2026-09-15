'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Eye, FileCheck2, Flag, ListChecks, MessageSquareText, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { assessments, type Assessment, type Message } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';


/**
 * Read-only view of one assessment for reviewers who do not decide (administrators, auditors):
 * result, explanation, facts with their source and confidence flags, decision, transcript.
 * Decisions are recorded only by requestors through ResultCard (FR-22, Overview.md roles).
 */
export function AssessmentDetail({ id }: { id: string }) {
  const locale = useLocale();
  const t = useTranslations('assessmentDetail');
  const resultCard = useTranslations('resultCard');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const [a, setA] = useState<Assessment | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unmask, setUnmask] = useState(false); // SEC-05: clear values on request; the backend logs the access

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([assessments.get(id, unmask), assessments.messages(id, unmask)])
      .then(([doc, msgs]) => {
        if (cancelled) return;
        setA(doc);
        setMessages(msgs);
      })
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
  if (!a) {
    return (
      <div role="status" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border bg-muted/20 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        {t('loading')}
      </div>
    );
  }
  const r = a.result;
  const flagged = a.facts.filter((f) => f.flagged);

  return (
    <div className={`space-y-4 text-sm transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      {a.masked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
          <span className="flex items-start gap-2 leading-5">
            <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
            {t('masked', { plan: a.masked.toUpperCase() })}
          </span>
          <Button type="button" size="sm" variant="outline" className="border-amber-300 bg-background/80" disabled={loading || unmask} onClick={() => setUnmask(true)}>
            {t('unmask')}
          </Button>
        </div>
      )}
      <section className="rounded-xl border bg-muted/15 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-background">{status.has(a.status) ? status(a.status) : a.status}</Badge>
          <span className="text-muted-foreground">
            {a.personaKey?.replace(/_/g, ' ') ?? '—'} · {a.scenarioKey?.replace(/_/g, ' ') ?? '—'}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <FileCheck2 aria-hidden="true" className="size-3.5" />
          {t('started', { date: new Date(a.createdAt).toLocaleString(locale) })}
        </div>
      </section>
      {r ? (
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid gap-4 border-b bg-muted/25 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex size-24 flex-col items-center justify-center rounded-2xl border bg-background shadow-sm">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{r.score}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{classification.has(r.classification) ? classification(r.classification) : r.classification}</Badge>
                {r.ruleDriven && <Badge variant="outline">{t('result.ruleDriven', { rule: r.ruleName ?? r.ruleKey ?? '' })}</Badge>}
                <Badge variant="outline">{t('result.confidence', { value: r.confidence })}</Badge>
                {r.mandatoryReview && <Badge variant="destructive">{t('result.mandatoryReview')}</Badge>}
                {r.professionalConsult && <Badge variant="secondary">{t('result.professionalConsult')}</Badge>}
              </div>
              <p className="max-w-3xl leading-6">{r.explanation}</p>
            </div>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-muted/15 p-4">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
                {t('result.recommendedAction')}
              </div>
              <p className="leading-6">{r.recommendedAction}</p>
            </div>
            {r.keyDrivers?.length > 0 && (
              <div className="rounded-xl border bg-muted/15 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <Flag aria-hidden="true" className="size-4 text-primary" />
                  {t('result.keyDrivers')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.keyDrivers.map((driver) => (
                    <Badge key={driver} variant="outline" className="h-auto whitespace-normal py-1 text-left font-normal">
                      {driver}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          {(r.nextSteps.length > 0 || Object.keys(r.factors).length > 0) && (
            <div className="grid gap-4 border-t p-4 lg:grid-cols-2">
              {r.nextSteps.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <ListChecks aria-hidden="true" className="size-4 text-primary" />
                    {resultCard('nextSteps')}
                  </div>
                  <ol className="space-y-2">
                    {r.nextSteps.map((step, index) => (
                      <li key={`${index}-${step}`} className="flex gap-2 text-muted-foreground">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{index + 1}</span>
                        <span className="leading-5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {Object.keys(r.factors).length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium">{resultCard('factors.title')}</summary>
                  <div className="mt-3 space-y-2">
                    {Object.entries(r.factors).map(([key, factor]) => (
                      <div key={key} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="tabular-nums text-muted-foreground">{resultCard('factors.points', { value: factor.contribution })}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/15 p-6 text-center text-muted-foreground">{t('result.empty')}</div>
      )}
      <section className="overflow-hidden rounded-xl border">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3 font-medium">
          <span className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
            {t('facts.title', { count: a.facts.length })}
          </span>
          {flagged.length > 0 && <Badge variant="destructive">{t('facts.lowConfidence', { count: flagged.length }).replace(/^,\s*/, '')}</Badge>}
        </div>
        <div className="overflow-x-auto px-4 pb-2">
          <table className="w-full min-w-[34rem] text-xs">
          <tbody>
            {a.facts.map((f) => (
              <tr key={f.key} className="border-b last:border-0">
                <td className="py-3 pr-3 font-mono text-[11px] text-muted-foreground">{f.key}</td>
                <td className="max-w-sm whitespace-normal py-3 pr-3 font-medium">{String(f.value)}</td>
                <td className="py-3 pr-3 capitalize text-muted-foreground">{f.source}</td>
                <td className="py-3 text-right tabular-nums text-muted-foreground">{f.flagged ? <Badge variant="destructive">{Math.round(f.confidence * 100)}%</Badge> : `${Math.round(f.confidence * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </section>
      {a.decision && (
        <section className={`rounded-xl border p-4 ${a.status === 'escalated' ? 'border-amber-300 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/60'}`}>
          <div className="flex items-start gap-3">
            {a.status === 'escalated'
              ? <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
              : <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-700" />}
            <div>
              <div className={`font-medium ${a.status === 'escalated' ? 'text-amber-950' : 'text-emerald-950'}`}>
                {t('decision.label')}: {t.has(`decision.types.${a.decision.type}`) ? t(`decision.types.${a.decision.type}`) : a.decision.type}
                {a.decision.overriddenTo ? ` → ${classification.has(a.decision.overriddenTo) ? classification(a.decision.overriddenTo) : a.decision.overriddenTo}` : ''}
                {a.status === 'escalated' && a.escalatedTo ? ` → ${a.escalatedTo.name}` : ''}
              </div>
              {a.status === 'escalated' && <div className="mt-1 text-sm font-medium text-amber-900">{resultCard('escalated.stillOpen')}</div>}
              {a.decision.reason && <div className={`mt-1 leading-5 ${a.status === 'escalated' ? 'text-amber-900/80' : 'text-emerald-900/75'}`}>{a.decision.reason}</div>}
              <div className={`mt-1 text-xs ${a.status === 'escalated' ? 'text-amber-900/70' : 'text-emerald-900/60'}`}>{new Date(a.decision.decidedAt).toLocaleString(locale)}</div>
            </div>
          </div>
        </section>
      )}
      <details className="overflow-hidden rounded-xl border text-xs text-muted-foreground">
        <summary className="flex cursor-pointer items-center gap-2 bg-muted/25 px-4 py-3 font-medium text-foreground">
          <MessageSquareText aria-hidden="true" className="size-4 text-primary" />
          {t('transcript', { count: messages.length })}
        </summary>
        <ol className="space-y-0 px-4 py-2">
          {messages.map((m) => (
            <li key={m._id} className="grid gap-1 border-b py-3 last:border-0 sm:grid-cols-[8rem_1fr]">
              <span className="font-medium capitalize text-foreground">{m.role} · {m.kind}</span>
              <span className="whitespace-pre-wrap leading-5">{m.content}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
