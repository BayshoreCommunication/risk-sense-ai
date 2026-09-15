'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
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
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const [a, setA] = useState<Assessment | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unmask, setUnmask] = useState(false); // SEC-05: clear values on request; the backend logs the access

  useEffect(() => {
    let cancelled = false;
    Promise.all([assessments.get(id, unmask), assessments.messages(id, unmask)])
      .then(([doc, msgs]) => {
        if (cancelled) return;
        setA(doc);
        setMessages(msgs);
      })
      .catch((e) => !cancelled && setError(toApiError(e).message));
    return () => {
      cancelled = true;
    };
  }, [id, unmask]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!a) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const r = a.result;
  const flagged = a.facts.filter((f) => f.flagged);

  return (
    <div className="space-y-4 text-sm">
      {a.masked && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          <span>
            {t('masked', { plan: a.masked.toUpperCase() })}
          </span>
          <button type="button" className="underline" onClick={() => setUnmask(true)}>
            {t('unmask')}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{status.has(a.status) ? status(a.status) : a.status}</Badge>
        <span className="text-muted-foreground">
          {a.personaKey?.replace(/_/g, ' ')} · {a.scenarioKey?.replace(/_/g, ' ')} · {t('started', { date: new Date(a.createdAt).toLocaleString(locale) })}
        </span>
      </div>
      {r ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-semibold">{r.score}/100</span>
            <Badge>{classification.has(r.classification) ? classification(r.classification) : r.classification}</Badge>
            {r.ruleDriven && <Badge variant="outline">{t('result.ruleDriven', { rule: r.ruleName ?? r.ruleKey ?? '' })}</Badge>}
            <Badge variant="outline">{t('result.confidence', { value: r.confidence })}</Badge>
            {r.mandatoryReview && <Badge variant="destructive">{t('result.mandatoryReview')}</Badge>}
            {r.professionalConsult && <Badge variant="secondary">{t('result.professionalConsult')}</Badge>}
          </div>
          <p>{r.explanation}</p>
          <p className="text-muted-foreground">
            {t('result.recommendedAction')}: <span className="font-medium text-foreground">{r.recommendedAction}</span>
          </p>
          {r.keyDrivers?.length > 0 && <p className="text-xs text-muted-foreground">{t('result.keyDrivers')}: {r.keyDrivers.join('; ')}</p>}
        </div>
      ) : (
        <p className="text-muted-foreground">{t('result.empty')}</p>
      )}
      <div>
        <div className="mb-1 font-medium">{t('facts.title', { count: a.facts.length })}{flagged.length ? ` ${t('facts.lowConfidence', { count: flagged.length })}` : ''}</div>
        <table className="w-full text-xs">
          <tbody>
            {a.facts.map((f) => (
              <tr key={f.key} className="border-t">
                <td className="py-1 pr-2 font-mono">{f.key}</td>
                <td className="py-1 pr-2">{String(f.value)}</td>
                <td className="py-1 pr-2 text-muted-foreground">{f.source}</td>
                <td className="py-1 text-muted-foreground">{f.flagged ? <Badge variant="destructive">{Math.round(f.confidence * 100)}%</Badge> : `${Math.round(f.confidence * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.decision && (
        <div className="rounded-md bg-muted p-3">
          <div className="font-medium">
            {t('decision.label')}: {t.has(`decision.types.${a.decision.type}`) ? t(`decision.types.${a.decision.type}`) : a.decision.type}
            {a.decision.overriddenTo ? ` → ${classification.has(a.decision.overriddenTo) ? classification(a.decision.overriddenTo) : a.decision.overriddenTo}` : ''}
            {a.status === 'escalated' && a.escalatedTo ? ` → ${a.escalatedTo.name}` : ''}
          </div>
          {a.decision.reason && <div className="text-muted-foreground">{a.decision.reason}</div>}
          <div className="text-xs text-muted-foreground">{new Date(a.decision.decidedAt).toLocaleString(locale)}</div>
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t('transcript', { count: messages.length })}</summary>
        <ol className="mt-2 space-y-1">
          {messages.map((m) => (
            <li key={m._id}>
              <span className="font-medium">{m.role}</span> · {m.kind}: {m.content}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
