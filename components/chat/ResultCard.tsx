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
const SCORE_ACCENT: Record<string, string> = {
  monitor_only: '#059669',
  risk: '#2563eb',
  elevated_risk: '#d97706',
  issue: '#e11d48',
};
const NOBODY = '__nobody';

function normalizedAction(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
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
  const score = Math.max(0, Math.min(100, result.score));
  const scoreAccent = SCORE_ACCENT[result.classification] ?? '#2563eb';
  const classificationLabel = classification.has(result.classification)
    ? classification(result.classification)
    : formatIdentifierLabel(result.classification);
  const distinctNextSteps = (result.nextSteps ?? []).filter(
    (step) => normalizedAction(step) !== normalizedAction(result.recommendedAction),
  );
  const classificationOptions = a.classifications.map((option) => ({
    value: option,
    label: classification.has(option) ? classification(option) : formatIdentifierLabel(option),
  }));
  const driverDisplay = (driver: string) => {
    const match = /^(.+?)\s*(>=|<=|=|>|<)\s*(.+)$/.exec(driver.trim());
    if (!match?.[1] || !match[2] || !match[3]) return { label: formatIdentifierTokensInText(driver) };

    const rawValue = match[3].trim();
    const value = /^true$/i.test(rawValue)
      ? t('yes')
      : /^false$/i.test(rawValue)
        ? t('no')
        : rawValue;
    const relation = {
      '>': 'above',
      '>=': 'atLeast',
      '<': 'below',
      '<=': 'atMost',
    }[match[2]];

    return {
      label: formatIdentifierLabel(match[1]),
      value: relation ? t(`driverRelations.${relation}`, { value }) : value,
    };
  };

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
    <section aria-labelledby={headingId} data-testid="assessment-result" className="overflow-hidden rounded-2xl border border-[#d7e1ed] bg-white shadow-[0_14px_38px_rgba(8,32,68,0.08)] ring-1 ring-[#082044]/[0.025] dark:border-border dark:bg-card dark:shadow-[0_16px_44px_rgba(0,0,0,0.28)] dark:ring-white/[0.035]">
      <div className={`border-l-[3px] ${ACCENT[result.classification] ?? 'border-l-primary'}`}>
        <div className="grid gap-4 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 dark:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_94%,var(--primary)_6%)_0%,var(--card)_100%)] sm:grid-cols-[7.25rem_minmax(0,1fr)] sm:px-5">
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#dfe7f1] bg-white/90 px-3 py-3 shadow-[0_4px_14px_rgba(8,38,82,0.045)] dark:border-border dark:bg-background/65 dark:shadow-[0_6px_18px_rgba(0,0,0,0.18)]">
            <div
              className="grid size-[4.75rem] place-items-center rounded-full p-[0.32rem] [--score-track:#e5ebf3] dark:[--score-track:color-mix(in_srgb,var(--border)_78%,var(--background)_22%)]"
              style={{ background: `conic-gradient(${scoreAccent} ${score * 3.6}deg, var(--score-track) 0deg)` }}
              role="img"
              aria-label={`${result.score} ${t('scoreOutOf')}`}
            >
              <div className="grid size-full place-items-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)] dark:bg-card dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                <span>
                  <span className="block font-heading text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-[#10233f] dark:text-foreground">{result.score}</span>
                  <span className="mt-0.5 block text-[0.58rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">/100</span>
                </span>
              </div>
            </div>
            <span className="mt-2 text-[0.62rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('scoreLabel')}</span>
          </div>

          <div className="min-w-0 self-center">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="mr-1 text-base font-semibold tracking-tight">{t('title')}</h3>
              <Badge variant={VARIANT[result.classification] ?? 'default'}>{classificationLabel}</Badge>
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
                  {t('ruleDriven', { rule: result.ruleName ?? formatIdentifierLabel(result.ruleKey ?? '') })}
                </Badge>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-[#e5ebf3] bg-white/75 px-3 py-2.5 dark:border-border dark:bg-background/50">
              <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold tracking-[0.1em] text-[#49627f] uppercase dark:text-muted-foreground">
                <Sparkles className="size-3 text-primary" aria-hidden="true" />
                {t('summaryLabel')}
              </p>
              <p className="mt-1.5 max-w-3xl text-[0.8rem] leading-[1.55] text-foreground/75">{result.explanation}</p>
            </div>
            {result.ruleDriven && result.computedClassification !== result.classification && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t('computedWithoutRule', {
                  classification: classification.has(result.computedClassification)
                    ? classification(result.computedClassification)
                    : formatIdentifierLabel(result.computedClassification),
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#e7edf4] dark:divide-border">
        <section className="flex items-start gap-3 bg-[#f5f8fc] px-4 py-3 dark:bg-muted/35 sm:px-5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f1ff] text-primary dark:bg-primary/15 dark:text-blue-300">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h4 className="text-[0.62rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('recommendedAction')}</h4>
            <p className="mt-0.5 text-[0.82rem] font-medium leading-5 text-foreground">{result.recommendedAction}</p>
          </div>
        </section>

        {(result.keyDrivers?.length > 0 || distinctNextSteps.length > 0) && (
          <div className={`grid ${result.keyDrivers?.length > 0 && distinctNextSteps.length > 0 ? 'lg:grid-cols-2 lg:divide-x' : ''}`}>
            {result.keyDrivers?.length > 0 && (
              <section className="px-4 py-3 sm:px-5">
                <h4 className="flex items-center gap-2 text-[0.75rem] font-semibold">
                  <Flag aria-hidden="true" className="size-3.5 text-primary" />
                  {detail('result.keyDrivers')}
                </h4>
                <ul className={`mt-2 grid gap-1.5 ${distinctNextSteps.length === 0 ? 'sm:grid-cols-2' : ''}`}>
                  {result.keyDrivers.map((driver) => {
                    const display = driverDisplay(driver);
                    return (
                      <li key={driver} className="grid grid-cols-[0.4rem_minmax(0,1fr)] gap-2 rounded-lg bg-[#f7f9fc] px-2.5 py-2 dark:bg-muted/35">
                        <span className="mt-[0.4rem] size-1.5 rounded-full bg-primary" aria-hidden="true" />
                        <span className="flex min-w-0 items-center justify-between gap-2 text-[0.72rem] leading-[1.125rem]">
                          <span className="min-w-0 truncate text-foreground/75">{display.label}</span>
                          {display.value && (
                            <span className="shrink-0 rounded-full border border-[#dbe5f1] bg-white px-2 py-0.5 text-[0.62rem] font-medium text-[#365675] dark:border-border dark:bg-background/70 dark:text-blue-200">
                              {display.value}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {distinctNextSteps.length > 0 && (
              <section className="border-t px-4 py-3 sm:px-5 lg:border-t-0">
                <h4 className="flex items-center gap-2 text-[0.75rem] font-semibold">
                  <ListChecks aria-hidden="true" className="size-3.5 text-primary" />
                  {t('nextSteps')}
                </h4>
                <ol className="mt-2 space-y-1.5">
                  {distinctNextSteps.map((step, index) => (
                    <li key={`${index}-${step}`} className="grid grid-cols-[1.35rem_minmax(0,1fr)] gap-2 text-[0.72rem] text-muted-foreground">
                      <span className="flex size-[1.15rem] items-center justify-center rounded-full border bg-background text-[0.58rem] font-semibold tabular-nums text-foreground">{index + 1}</span>
                      <span className="leading-[1.15rem]">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        {factorEntries.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[0.75rem] font-semibold outline-none transition hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 dark:hover:bg-muted/45 sm:px-5 [&::-webkit-details-marker]:hidden">
              <Scale aria-hidden="true" className="size-3.5 text-primary" />
              <span className="flex-1">{t('factors.title')}</span>
              <span className="rounded-full bg-[#eef4fb] px-2 py-0.5 text-[0.6rem] font-semibold tabular-nums text-[#315b91] dark:bg-primary/15 dark:text-blue-200">{factorEntries.length}</span>
              <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-[#e7edf4] px-4 py-3 dark:border-border sm:px-5">
              <div className="hidden grid-cols-[minmax(9rem,1fr)_5rem_6rem_6rem] gap-4 px-2 pb-2 text-[0.58rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:grid">
                <span>{t('factors.factorLabel')}</span>
                <span>{t('factors.valueLabel')}</span>
                <span>{t('factors.weightLabel')}</span>
                <span className="text-right">{t('factors.contributionLabel')}</span>
              </div>
              <dl className="space-y-1">
                {factorEntries.map(([key, factor]) => {
                  const contributionRatio = factor.weight > 0
                    ? Math.max(0, Math.min(100, (Math.abs(factor.contribution) / factor.weight) * 100))
                    : 0;
                  return (
                    <div key={key} className="grid gap-2 rounded-lg bg-[#f8fafc] px-2.5 py-2 text-[0.7rem] dark:bg-muted/35 sm:grid-cols-[minmax(9rem,1fr)_5rem_6rem_6rem] sm:items-center sm:gap-4">
                      <dt className="min-w-0 font-medium text-foreground">
                        <span className="block truncate">{formatIdentifierLabel(key)}</span>
                        <span
                          className="mt-1 block h-1 overflow-hidden rounded-full bg-[#e7edf4] dark:bg-border"
                          aria-label={`${t('factors.contributionLabel')}: ${t('factors.points', { value: factor.contribution.toFixed(1) })}`}
                          title={`${t('factors.contributionLabel')}: ${t('factors.points', { value: factor.contribution.toFixed(1) })}`}
                        >
                          <span className="block h-full rounded-full bg-primary/65" style={{ width: `${contributionRatio}%` }} />
                        </span>
                      </dt>
                      <dd className="flex justify-between gap-3 text-muted-foreground sm:block">
                        <span className="font-medium text-foreground/55 sm:hidden">{t('factors.valueLabel')}</span>
                        <span>{factor.value}</span>
                      </dd>
                      <dd className="flex justify-between gap-3 tabular-nums text-muted-foreground sm:block">
                        <span className="font-medium text-foreground/55 sm:hidden">{t('factors.weightLabel')}</span>
                        <span>{factor.weight}%</span>
                      </dd>
                      <dd className="flex justify-between gap-3 font-semibold tabular-nums text-foreground sm:block sm:text-right">
                        <span className="font-medium text-foreground/55 sm:hidden">{t('factors.contributionLabel')}</span>
                        <span>{t('factors.points', { value: factor.contribution.toFixed(1) })}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </details>
        )}

        <section className="bg-[linear-gradient(180deg,#f8fafc_0%,#f3f7fc_100%)] px-4 py-3.5 dark:bg-[linear-gradient(180deg,var(--card)_0%,color-mix(in_srgb,var(--card)_84%,var(--background)_16%)_100%)] sm:px-5" aria-labelledby={`${headingId}-decision`}>
          {decided ? (
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                <CheckCircle2 aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h4 id={`${headingId}-decision`} className="text-sm font-semibold">
                  {t('decision.recorded')}: {t(`decision.types.${a.decision!.type}`)}
                  {a.decision!.overriddenTo
                    ? ` → ${classification.has(a.decision!.overriddenTo) ? classification(a.decision!.overriddenTo) : formatIdentifierLabel(a.decision!.overriddenTo)}`
                    : ''}
                </h4>
                {a.decision!.reason && <p className="mt-1 text-sm leading-5 text-muted-foreground">{a.decision!.reason}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(a.decision!.decidedAt).toLocaleString(locale)} · {t('decision.status', { status: status.has(a.status) ? status(a.status) : formatIdentifierLabel(a.status) })}
                </p>
              </div>
            </div>
          ) : (
            <div>
              {a.status === 'escalated' && a.decision && (
                <div className="mb-4 flex items-start gap-2.5 border-l-2 border-amber-500 bg-amber-50/70 px-3 py-2.5 text-xs leading-5 text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
                  <Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
                  <p>
                    {a.escalatedTo ? t('escalated.toReviewer', { name: a.escalatedTo.name }) : t('escalated.label')}
                    {a.decision.reason ? ` — ${a.decision.reason}` : ''} · {new Date(a.decision.decidedAt).toLocaleString(locale)}. {t('escalated.stillOpen')}
                  </p>
                </div>
              )}

              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div className="flex max-w-2xl items-start gap-2.5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-[#dce6f2] bg-white text-primary dark:border-border dark:bg-background/70 dark:text-blue-300">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <h4 id={`${headingId}-decision`} className="text-[0.78rem] font-semibold">{t('decision.title')}</h4>
                    <p className="mt-0.5 text-[0.68rem] leading-[1.1rem] text-muted-foreground">{t('decision.notice')}</p>
                  </div>
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
                      <Select items={classificationOptions} value={overrideClassification} onValueChange={(value) => setOverrideClassification(value ?? '')}>
                        <SelectTrigger id={classificationSelectId} className="w-full bg-background" aria-label={t('override.classificationLabel')}>
                          <SelectValue placeholder={t('override.classificationPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {classificationOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
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
