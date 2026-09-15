'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Flag,
  ListChecks,
  Route,
  Scale,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { assessments, type Assessment, type DecisionInput, type EscalationTarget } from '@/lib/assessments';

const VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  monitor_only: 'secondary',
  risk: 'default',
  elevated_risk: 'default',
  issue: 'destructive',
};
const NOBODY = '__nobody';

/**
 * The AI recommendation + the human decision (FR-20, AI-02, FR-22, FR-23). The assessment cannot close
 * without one of the three decisions — the backend enforces it; this card just offers them.
 */
export function ResultCard({ a, onDecide, busy }: { a: Assessment; onDecide: (d: DecisionInput) => void; busy: boolean }) {
  const locale = useLocale();
  const t = useTranslations('resultCard');
  const detail = useTranslations('assessmentDetail');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const r = a.result!;
  const [mode, setMode] = useState<'none' | 'override' | 'escalate'>('none');
  const [reason, setReason] = useState('');
  const [to, setTo] = useState<string>('');
  const [targets, setTargets] = useState<EscalationTarget[] | null>(null); // null = not loaded; [] = FREE / nobody
  const [target, setTarget] = useState<string>(NOBODY);
  const decided = a.decision && a.status !== 'escalated';
  const isError = a.status === 'error_review';
  const factorEntries = Object.entries(r.factors ?? {});

  // Close the override/escalate form once a decision has been recorded (status or decision time changed).
  const decidedAt = a.decision?.decidedAt;
  useEffect(() => {
    setMode('none');
    setReason('');
  }, [a.status, decidedAt]);

  // T-061: reviewers this assessment can be routed to (PAID); loaded once the user opens "Escalate…".
  useEffect(() => {
    if (mode !== 'escalate' || targets !== null) return;
    assessments
      .escalationTargets(a._id)
      .then(setTargets)
      .catch(() => setTargets([]));
  }, [mode, targets, a._id]);

  const targetOptions = [
    { value: NOBODY, label: t('routing.noSpecificReviewer') },
    ...(targets ?? []).map((option) => ({
      value: option._id,
      label: `${option.name}${option.crossDepartmentAccess ? ` ${t('routing.crossDepartmentSuffix')}` : ''}`,
    })),
  ];

  return (
    <Card className="gap-0 border-primary/15 bg-card py-0 shadow-[0_16px_44px_rgba(26,69,128,0.1)]">
      <CardHeader className="border-b bg-[linear-gradient(135deg,rgba(235,243,255,0.92),rgba(255,255,255,0.96)_58%,rgba(244,239,255,0.82))] py-5">
        <div className="grid gap-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-center">
          <div className="flex h-[5.5rem] flex-col items-center justify-center rounded-2xl border border-primary/15 bg-background/90 shadow-[0_8px_24px_rgba(28,76,145,0.09)]">
            <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{r.score}</span>
            <span className="text-xs font-medium text-muted-foreground">/100</span>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={VARIANT[r.classification] ?? 'default'} className="h-7 px-2.5 text-xs">
                {classification.has(r.classification) ? classification(r.classification) : r.classification}
              </Badge>
              {r.mandatoryReview && (
                <Badge variant="destructive" className="gap-1.5">
                  <ShieldAlert aria-hidden="true" className="size-3.5" />
                  {detail('result.mandatoryReview')}
                </Badge>
              )}
              {isError && <Badge variant="destructive">{t('errorReview')}</Badge>}
              <Badge variant="outline" className="bg-background/80">
                {t('confidence', { value: r.confidence })}
              </Badge>
              {r.professionalConsult && <Badge variant="secondary">{t('professionalConsult')}</Badge>}
              {r.ruleDriven && (
                <Badge variant="outline" className="gap-1.5 bg-background/80">
                  <Sparkles aria-hidden="true" className="size-3" />
                  {t('ruleDriven', { rule: r.ruleName ?? r.ruleKey ?? '' })}
                </Badge>
              )}
            </div>
            <CardDescription className="max-w-3xl text-sm leading-6 text-foreground/75">{r.explanation}</CardDescription>
            {r.ruleDriven && r.computedClassification !== r.classification && (
              <p className="text-xs leading-5 text-muted-foreground">
                {t('computedWithoutRule', {
                  classification: classification.has(r.computedClassification) ? classification(r.computedClassification) : r.computedClassification,
                })}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
              <span>{t('recommendedAction')}:</span>
            </div>
            <p className="leading-6 text-foreground/80">{r.recommendedAction}</p>
          </section>

          {r.keyDrivers?.length > 0 && (
            <section className="rounded-xl border bg-muted/15 p-4">
              <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                <Flag aria-hidden="true" className="size-4 text-primary" />
                {detail('result.keyDrivers')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.keyDrivers.map((driver) => (
                  <Badge key={driver} variant="outline" className="h-auto whitespace-normal bg-background py-1 text-left font-normal leading-5">
                    {driver}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </div>

        {(r.nextSteps?.length > 0 || factorEntries.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {r.nextSteps?.length > 0 && (
              <section className="rounded-xl border bg-muted/10 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ListChecks aria-hidden="true" className="size-4 text-primary" />
                  <span>{t('nextSteps')}:</span>
                </div>
                <ol className="space-y-2.5">
                  {r.nextSteps.map((step, index) => (
                    <li key={`${index}-${step}`} className="flex gap-2.5 text-sm text-muted-foreground">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.68rem] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="leading-5">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {factorEntries.length > 0 && (
              <details className="group rounded-xl border bg-muted/10 open:bg-background">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
                  <Scale aria-hidden="true" className="size-4 text-primary" />
                  <span className="flex-1">{t('factors.title')}</span>
                  <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="overflow-x-auto border-t px-4 pb-3">
                  <table className="w-full min-w-[23rem] text-xs">
                    <tbody>
                      {factorEntries.map(([key, factor]) => (
                        <tr key={key} className="border-b last:border-0">
                          <td className="py-2.5 pr-3 font-medium text-foreground">{key}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{t('factors.value', { value: factor.value })}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{factor.weight}%</td>
                          <td className="py-2.5 pl-3 text-right font-medium tabular-nums">{t('factors.points', { value: factor.contribution.toFixed(1) })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        <section className="rounded-xl border bg-background shadow-[0_1px_2px_rgba(15,35,65,0.03)]">
          {decided ? (
            <div className="flex items-start gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 aria-hidden="true" className="size-4.5" />
              </span>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-sm">
                  {t('decision.label')}: {t(`decision.types.${a.decision!.type}`)}
                  {a.decision!.overriddenTo
                    ? ` → ${classification.has(a.decision!.overriddenTo) ? classification(a.decision!.overriddenTo) : a.decision!.overriddenTo}`
                    : ''}
                </CardTitle>
                {a.decision!.reason && <p className="leading-5 text-muted-foreground">{a.decision!.reason}</p>}
                <p className="text-xs text-muted-foreground">
                  {new Date(a.decision!.decidedAt).toLocaleString(locale)} · {t('decision.status', { status: status.has(a.status) ? status(a.status) : a.status })}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {a.status === 'escalated' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-950">
                  <Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  <p>
                    {a.escalatedTo ? t('escalated.toReviewer', { name: a.escalatedTo.name }) : t('escalated.label')}
                    {a.decision?.reason ? ` — ${a.decision.reason}` : ''} · {new Date(a.decision!.decidedAt).toLocaleString(locale)}. {t('escalated.stillOpen')}
                  </p>
                </div>
              )}

              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{t('decision.notice')}</p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={busy || isError} onClick={() => onDecide({ type: 'accept' })}>
                    <CheckCircle2 aria-hidden="true" />
                    {t('actions.accept')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setMode(mode === 'override' ? 'none' : 'override')}>
                    <Scale aria-hidden="true" />
                    {t('actions.override')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setMode(mode === 'escalate' ? 'none' : 'escalate')}>
                    <ArrowUpRight aria-hidden="true" />
                    {t('actions.escalate')}
                  </Button>
                </div>
              </div>

              {mode !== 'none' && (
                <div className="space-y-3 rounded-xl border border-primary/15 bg-muted/15 p-3.5">
                  {mode === 'override' && (
                    <Select value={to} onValueChange={(value) => setTo(value ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('override.classificationPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {a.classifications.map((option) => (
                          <SelectItem key={option} value={option}>
                            {classification.has(option) ? classification(option) : option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {mode === 'escalate' && targets !== null && targets.length > 0 && (
                    <Select items={targetOptions} value={target} onValueChange={(value) => setTarget(value ?? NOBODY)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('routing.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {targetOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {mode === 'escalate' && targets !== null && targets.length === 0 && (
                    <p className="text-xs leading-5 text-muted-foreground">{t('routing.unavailable')}</p>
                  )}

                  <Textarea
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={mode === 'override' ? t('override.reasonPlaceholder') : t('escalated.reasonPlaceholder')}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || (mode === 'override' && (!to || reason.trim().length < 25))}
                    onClick={() =>
                      onDecide(
                        mode === 'override'
                          ? { type: 'override', overriddenTo: to as DecisionInput['overriddenTo'], reason }
                          : { type: 'escalate', reason: reason || undefined, ...(target !== NOBODY ? { escalateToUserId: target } : {}) },
                      )
                    }
                  >
                    {mode === 'override' ? t('actions.recordOverride') : t('actions.escalateSubmit')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
