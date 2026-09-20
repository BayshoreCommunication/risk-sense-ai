'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Flag,
  ListChecks,
  LoaderCircle,
  Route,
  Scale,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { assessments, type Assessment, type DecisionInput, type EscalationTarget } from '@/lib/assessments';
import { formatIdentifierLabel, formatIdentifierTokensInText } from '@/lib/format-identifier-label';

const VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  monitor_only: 'secondary',
  risk: 'default',
  elevated_risk: 'default',
  issue: 'destructive',
};
const ACCENT: Record<string, string> = {
  monitor_only: 'border-l-emerald-500',
  risk: 'border-l-sky-600',
  elevated_risk: 'border-l-amber-500',
  issue: 'border-l-rose-600',
};
const NOBODY = '__nobody';

function humanizeDriver(driver: string) {
  return formatIdentifierTokensInText(driver);
}

/** The deterministic result and the human decision required before an assessment can close. */
export function ResultCard({
  a,
  onDecide,
  busy,
  decisionBusy,
}: {
  a: Assessment;
  onDecide: (decision: DecisionInput) => void;
  busy: boolean;
  decisionBusy: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('resultCard');
  const detail = useTranslations('assessmentDetail');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const result = a.result!;
  const headingId = useId();
  const classificationSelectId = useId();
  const reviewerSelectId = useId();
  const reasonId = useId();
  const [mode, setMode] = useState<'none' | 'override' | 'escalate'>('none');
  const [reason, setReason] = useState('');
  const [overrideClassification, setOverrideClassification] = useState<string>('');
  const [targets, setTargets] = useState<EscalationTarget[] | null>(null);
  const [target, setTarget] = useState<string>(NOBODY);
  const [pendingDecisionType, setPendingDecisionType] = useState<DecisionInput['type'] | null>(null);
  const decided = a.decision && a.status !== 'escalated';
  const isError = a.status === 'error_review';
  const factorEntries = Object.entries(result.factors ?? {});

  const decidedAt = a.decision?.decidedAt;
  useEffect(() => {
    setMode('none');
    setReason('');
  }, [a.status, decidedAt]);

  useEffect(() => {
    if (!decisionBusy) setPendingDecisionType(null);
  }, [decisionBusy]);

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

  const decide = (decision: DecisionInput) => {
    setPendingDecisionType(decision.type);
    onDecide(decision);
  };

  return (
    <section aria-labelledby={headingId} data-testid="assessment-result" className="overflow-hidden rounded-2xl border border-[#d7e1ed] bg-card shadow-[0_14px_38px_rgba(8,32,68,0.09)] ring-1 ring-[#082044]/[0.025]">
      <div className={`grid border-l-[3px] sm:grid-cols-[6rem_minmax(0,1fr)] ${ACCENT[result.classification] ?? 'border-l-primary'}`}>
        <div className="flex items-center gap-2.5 bg-[linear-gradient(145deg,#061d43_0%,#0d3b78_100%)] px-3.5 py-3 text-white shadow-[inset_-1px_0_rgba(255,255,255,0.08)] sm:flex-col sm:justify-center sm:gap-0 sm:px-2.5 sm:py-4 sm:text-center">
          <span className="font-heading text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{result.score}</span>
          <span className="text-xs font-medium text-white/60">{t('scoreOutOf')}</span>
        </div>

        <div className="min-w-0 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="mr-1 text-base font-semibold tracking-tight">{t('title')}</h3>
            <Badge variant={VARIANT[result.classification] ?? 'default'}>
              {classification.has(result.classification) ? classification(result.classification) : result.classification}
            </Badge>
            <Badge variant="outline">{t('confidence', { value: result.confidence })}</Badge>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.mandatoryReview && (
              <Badge variant="destructive" className="gap-1.5">
                <ShieldAlert aria-hidden="true" className="size-3.5" />
                {detail('result.mandatoryReview')}
              </Badge>
            )}
            {isError && <Badge variant="destructive">{t('errorReview')}</Badge>}
            {result.professionalConsult && <Badge variant="secondary">{t('professionalConsult')}</Badge>}
            {result.ruleDriven && (
              <Badge variant="outline" className="gap-1.5">
                <Sparkles aria-hidden="true" className="size-3" />
                {t('ruleDriven', { rule: result.ruleName ?? result.ruleKey ?? '' })}
              </Badge>
            )}
          </div>

          <p className="mt-2.5 max-w-3xl text-sm leading-[1.5] text-foreground/75">{result.explanation}</p>
          {result.ruleDriven && result.computedClassification !== result.classification && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {t('computedWithoutRule', {
                classification: classification.has(result.computedClassification)
                  ? classification(result.computedClassification)
                  : result.computedClassification,
              })}
            </p>
          )}
        </div>
      </div>

      <div className="divide-y">
        <section className="grid gap-1.5 bg-primary/[0.025] px-4 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:px-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
            {t('recommendedAction')}
          </h4>
          <p className="text-sm leading-5 text-foreground/80">{result.recommendedAction}</p>
        </section>

        {(result.keyDrivers?.length > 0 || result.nextSteps?.length > 0) && (
          <div className="grid lg:grid-cols-2 lg:divide-x">
            {result.keyDrivers?.length > 0 && (
              <section className="px-4 py-3.5 sm:px-5">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Flag aria-hidden="true" className="size-4 text-primary" />
                  {detail('result.keyDrivers')}
                </h4>
                <ul className="mt-2 divide-y">
                  {result.keyDrivers.map((driver) => (
                    <li key={driver} className="grid grid-cols-[0.45rem_minmax(0,1fr)] gap-2.5 py-1.5 first:pt-0 last:pb-0">
                      <span className="mt-2 size-1.5 rounded-full bg-primary" aria-hidden="true" />
                      <span className="text-sm leading-5 text-foreground/75">{humanizeDriver(driver)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.nextSteps?.length > 0 && (
              <section className="border-t px-4 py-3.5 sm:px-5 lg:border-t-0">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <ListChecks aria-hidden="true" className="size-4 text-primary" />
                  {t('nextSteps')}
                </h4>
                <ol className="mt-2 space-y-2">
                  {result.nextSteps.map((step, index) => (
                    <li key={`${index}-${step}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 text-sm text-muted-foreground">
                      <span className="flex size-5 items-center justify-center rounded-md border bg-background text-[0.65rem] font-semibold tabular-nums text-foreground">{index + 1}</span>
                      <span className="pt-0.5 leading-5">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        {factorEntries.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:px-5 [&::-webkit-details-marker]:hidden">
              <Scale aria-hidden="true" className="size-4 text-primary" />
              <span className="flex-1">{t('factors.title')}</span>
              <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <dl className="divide-y border-t px-4 sm:px-5">
              {factorEntries.map(([key, factor]) => (
                <div key={key} className="grid gap-1 py-3 text-xs sm:grid-cols-[minmax(8rem,1fr)_auto_auto_auto] sm:items-center sm:gap-5">
                  <dt className="font-medium text-foreground">{formatIdentifierLabel(key)}</dt>
                  <dd className="text-muted-foreground">{t('factors.value', { value: factor.value })}</dd>
                  <dd className="tabular-nums text-muted-foreground">{factor.weight}%</dd>
                  <dd className="font-medium tabular-nums sm:text-right">{t('factors.points', { value: factor.contribution.toFixed(1) })}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        <section className="bg-[linear-gradient(180deg,#f8fafc_0%,#f3f7fc_100%)] px-4 py-3.5 sm:px-5" aria-labelledby={`${headingId}-decision`}>
          {decided ? (
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <CheckCircle2 aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h4 id={`${headingId}-decision`} className="text-sm font-semibold">
                  {t('decision.recorded')}: {t(`decision.types.${a.decision!.type}`)}
                  {a.decision!.overriddenTo
                    ? ` → ${classification.has(a.decision!.overriddenTo) ? classification(a.decision!.overriddenTo) : a.decision!.overriddenTo}`
                    : ''}
                </h4>
                {a.decision!.reason && <p className="mt-1 text-sm leading-5 text-muted-foreground">{a.decision!.reason}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(a.decision!.decidedAt).toLocaleString(locale)} · {t('decision.status', { status: status.has(a.status) ? status(a.status) : a.status })}
                </p>
              </div>
            </div>
          ) : (
            <div>
              {a.status === 'escalated' && a.decision && (
                <div className="mb-4 flex items-start gap-2.5 border-l-2 border-amber-500 bg-amber-50/70 px-3 py-2.5 text-xs leading-5 text-amber-950">
                  <Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  <p>
                    {a.escalatedTo ? t('escalated.toReviewer', { name: a.escalatedTo.name }) : t('escalated.label')}
                    {a.decision.reason ? ` — ${a.decision.reason}` : ''} · {new Date(a.decision.decidedAt).toLocaleString(locale)}. {t('escalated.stillOpen')}
                  </p>
                </div>
              )}

              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div className="max-w-2xl">
                  <h4 id={`${headingId}-decision`} className="text-sm font-semibold">{t('decision.title')}</h4>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('decision.notice')}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={busy || isError} onClick={() => decide({ type: 'accept' })}>
                    {decisionBusy && pendingDecisionType === 'accept' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                    {decisionBusy && pendingDecisionType === 'accept' ? t('decision.recording') : t('actions.accept')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" aria-expanded={mode === 'override'} disabled={busy} onClick={() => setMode(mode === 'override' ? 'none' : 'override')}>
                    <Scale aria-hidden="true" />
                    {t('actions.override')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" aria-expanded={mode === 'escalate'} disabled={busy} onClick={() => setMode(mode === 'escalate' ? 'none' : 'escalate')}>
                    <ArrowUpRight aria-hidden="true" />
                    {t('actions.escalate')}
                  </Button>
                </div>
              </div>

              {mode !== 'none' && (
                <div className="mt-4 grid gap-3.5 border-t pt-4">
                  {mode === 'override' && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium" htmlFor={classificationSelectId}>{t('override.classificationLabel')}</label>
                      <Select value={overrideClassification} onValueChange={(value) => setOverrideClassification(value ?? '')}>
                        <SelectTrigger id={classificationSelectId} className="w-full bg-background" aria-label={t('override.classificationLabel')}>
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
                    </div>
                  )}

                  {mode === 'escalate' && targets === null && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      {t('routing.loading')}
                    </p>
                  )}

                  {mode === 'escalate' && targets !== null && targets.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium" htmlFor={reviewerSelectId}>{t('routing.reviewerLabel')}</label>
                      <Select items={targetOptions} value={target} onValueChange={(value) => setTarget(value ?? NOBODY)}>
                        <SelectTrigger id={reviewerSelectId} className="w-full bg-background" aria-label={t('routing.reviewerLabel')}>
                          <SelectValue placeholder={t('routing.placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {targetOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {mode === 'escalate' && targets !== null && targets.length === 0 && (
                    <p className="text-xs leading-5 text-muted-foreground">{t('routing.unavailable')}</p>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-medium" htmlFor={reasonId}>
                      {mode === 'override' ? t('override.reasonLabel') : t('escalated.reasonLabel')}
                    </label>
                    <Textarea
                      id={reasonId}
                      rows={3}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={mode === 'override' ? t('override.reasonPlaceholder') : t('escalated.reasonPlaceholder')}
                      className="bg-background"
                    />
                    {mode === 'override' && <p className="mt-1.5 text-xs text-muted-foreground">{t('override.reasonHint')}</p>}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="w-fit"
                    disabled={busy || (mode === 'override' && (!overrideClassification || reason.trim().length < 25))}
                    onClick={() =>
                      decide(
                        mode === 'override'
                          ? { type: 'override', overriddenTo: overrideClassification as DecisionInput['overriddenTo'], reason }
                          : { type: 'escalate', reason: reason || undefined, ...(target !== NOBODY ? { escalateToUserId: target } : {}) },
                      )
                    }
                  >
                    {decisionBusy && pendingDecisionType === mode && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {decisionBusy && pendingDecisionType === mode ? t('decision.recording') : mode === 'override' ? t('actions.recordOverride') : t('actions.escalateSubmit')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
