'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, CalendarDays, ChartNoAxesColumn, ChartPie, ClipboardList, Clock3, RefreshCw, ShieldX, Table2, TrendingUp, X } from 'lucide-react';
import { ChartStyles, PieChart, STATUS, StackedClassificationChart, StatTile, type StackedClassificationMonth } from '@/components/analytics/Charts';
import { formatIdentifierLabel } from '@/components/admin/format-identifier-label';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkspace } from '@/components/shell/workspace-context';
import { toApiError } from '@/lib/api/client';
import { assessments, type AssessmentListItem } from '@/lib/assessments';
import { fmtSeconds, reports, type ReportQuery, type ReportResult, type ReportType } from '@/lib/reports';

const SUMMARY_TYPES: ReportType[] = ['volume', 'classification', 'override-rate', 'assessment-time'];
const CLASSIFICATION_KEYS = ['monitor_only', 'risk', 'elevated_risk', 'issue'] as const;
type ClassificationKey = (typeof CLASSIFICATION_KEYS)[number];
type MonthlyClassificationResult = { key: string; total: number | null; values: Record<ClassificationKey, number | null> };
type DrilldownState =
  | { status: 'idle' | 'loading'; items: AssessmentListItem[]; error: null }
  | { status: 'ready'; items: AssessmentListItem[]; error: null }
  | { status: 'error'; items: AssessmentListItem[]; error: string };

const EMPTY_DRILLDOWN: DrilldownState = { status: 'idle', items: [], error: null };

function lastFiveCompleteMonths(reference = new Date()) {
  const currentMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  return Array.from({ length: 5 }, (_, index) => {
    const from = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - (5 - index), 1));
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return { key: from.toISOString().slice(0, 7), from: from.toISOString(), to: new Date(next.getTime() - 1).toISOString() };
  });
}

function finalClassification(item: AssessmentListItem) {
  return item.decision?.type === 'override' && item.decision.overriddenTo
    ? item.decision.overriddenTo
    : item.result?.classification;
}

/** Folds `period x classification` trend rows into one entry per month. */
function monthsFromTrends(keys: string[], result: ReportResult): MonthlyClassificationResult[] {
  const counts = new Map<string, number>();
  for (const row of result.rows) counts.set(`${String(row.period)}|${String(row.group)}`, Number(row.count) || 0);
  return keys.map((key) => {
    const values = Object.fromEntries(
      CLASSIFICATION_KEYS.map((classification) => [classification, counts.get(`${key}|${classification}`) ?? 0]),
    ) as Record<ClassificationKey, number | null>;
    const total = CLASSIFICATION_KEYS.reduce((sum, classification) => sum + (values[classification] ?? 0), 0);
    return { key, total, values };
  });
}

/**
 * DASH-03 analytics dashboard, laid out as docs/design/figma-frames/17-admin-analytics-dashboard.png:
 * headline metrics and the monthly classification distribution. The FR-26 report views, their FR-28
 * exports and the FR-27 trend breakdown live on /admin/reports.
 */
function AnalyticsDashboard() {
  const t = useTranslations('admin.analytics');
  const reviewT = useTranslations('reviewDashboard');
  const statusT = useTranslations('status');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const [data, setData] = useState<Partial<Record<ReportType, ReportResult>>>({});
  const [monthlyClassification, setMonthlyClassification] = useState<MonthlyClassificationResult[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedClassification, setSelectedClassification] = useState<ClassificationKey | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownState>(EMPTY_DRILLDOWN);
  const drilldownCache = useRef(new Map<string, AssessmentListItem[]>());
  const [refreshVersion, setRefreshVersion] = useState(0);
  // Client comment 50: the viewer self-selects how the same month data is presented.
  const [view, setView] = useState<'chart' | 'pie' | 'table'>('chart');
  const [error, setError] = useState<string | null>(null);
  const monthWindow = useMemo(() => lastFiveCompleteMonths(), []);

  // Headline metrics cover the trailing twelve months; the chart covers the five complete months the frame shows.
  const summaryQuery = useMemo<ReportQuery>(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - 365 * 86400e3).toISOString(), to: to.toISOString(), interval: 'month' };
  }, []);

  const load = useCallback(
    (refresh = false) => {
      if (refresh) {
        drilldownCache.current.clear();
        setRefreshVersion((version) => version + 1);
      }
      setData({});
      setMonthlyClassification(null);
      setError(null);
      const q: ReportQuery = refresh ? { ...summaryQuery, refresh: 'true' } : summaryQuery;
      for (const type of SUMMARY_TYPES) {
        reports
          .get(type, q)
          .then((r) => setData((d) => ({ ...d, [type]: r })))
          .catch((e) => setError(toApiError(e).message));
      }
      // One month-grouped trends call rather than one request per month: five report calls per page
      // load pushed a normal browsing session past the 60/min per-session budget (SEC-04).
      reports
        .trends({ from: monthWindow[0]!.from, to: monthWindow.at(-1)!.to, interval: 'month', by: 'classification', ...(refresh ? { refresh: 'true' } : {}) })
        .then((result) => {
          const months = monthsFromTrends(monthWindow.map((month) => month.key), result);
          setMonthlyClassification(months);
          setSelectedMonth((current) => (current && months.some((month) => month.key === current) ? current : (months.at(-1)?.key ?? null)));
        })
        .catch((e) => {
          setMonthlyClassification([]);
          setError(toApiError(e).message);
        });
    },
    [monthWindow, summaryQuery],
  );
  useEffect(() => load(), [load]);

  const vol = data.volume;
  const cls = data.classification;
  const ovr = data['override-rate'];
  const tim = data['assessment-time'];
  const scored = cls ? Number(cls.summary.scored) : 0;
  const elevatedCount = cls
    ? cls.rows.reduce((total, row) => (row.classification === 'elevated_risk' || row.classification === 'issue' ? total + Number(row.count ?? 0) : total), 0)
    : 0;
  const elevatedRate = scored ? Math.round((elevatedCount / scored) * 1000) / 10 : null;

  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }), [locale]);
  const stackedClassificationMonths = useMemo<StackedClassificationMonth[]>(
    () =>
      (monthlyClassification ?? []).map((month) => ({
        key: month.key,
        label: monthFormatter.format(new Date(`${month.key}-01T00:00:00.000Z`)),
        total: month.total,
        segments: CLASSIFICATION_KEYS.map((classification) => ({
          key: classification,
          label: t(`classifications.${classification}`),
          value: month.values[classification],
        })),
      })),
    [monthlyClassification, monthFormatter, t],
  );
  const selectedMonthData = stackedClassificationMonths.find((month) => month.key === selectedMonth) ?? stackedClassificationMonths.at(-1) ?? null;
  const selectedSegment = selectedMonthData?.segments.find((segment) => segment.key === selectedClassification) ?? null;

  // Comment 49 requires a real drill-down, not merely a highlighted aggregate. The list endpoint's
  // `classification` filter is the AI class, while this chart uses the final class (human override wins),
  // so read the selected UTC month and apply the same final-class rule client-side.
  useEffect(() => {
    if (!selectedMonth || !selectedClassification) {
      setDrilldown(EMPTY_DRILLDOWN);
      return;
    }
    const selectedWindow = monthWindow.find((month) => month.key === selectedMonth);
    if (!selectedWindow) {
      setDrilldown({ status: 'error', items: [], error: t('monthly.empty') });
      return;
    }

    const cachedItems = drilldownCache.current.get(selectedMonth);
    if (cachedItems) {
      setDrilldown({ status: 'ready', items: cachedItems.filter((item) => finalClassification(item) === selectedClassification), error: null });
      return;
    }

    let active = true;
    setDrilldown({ status: 'loading', items: [], error: null });
    void (async () => {
      try {
        const first = await assessments.list({ from: selectedWindow.from, to: selectedWindow.to, limit: 200, page: 1, sort: 'newest' });
        const remaining = first.pages > 1
          ? await Promise.all(Array.from({ length: first.pages - 1 }, (_, index) => assessments.list({ from: selectedWindow.from, to: selectedWindow.to, limit: 200, page: index + 2, sort: 'newest' })))
          : [];
        const monthItems = [first, ...remaining].flatMap((page) => page.items);
        const items = monthItems.filter((item) => finalClassification(item) === selectedClassification);
        if (active) {
          drilldownCache.current.set(selectedMonth, monthItems);
          setDrilldown({ status: 'ready', items, error: null });
        }
      } catch (loadError) {
        if (active) setDrilldown({ status: 'error', items: [], error: toApiError(loadError).message });
      }
    })();
    return () => {
      active = false;
    };
  }, [monthWindow, refreshVersion, selectedClassification, selectedMonth, t]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    [locale],
  );

  return (
    <div className="page-shell">
      <ChartStyles />
      <PageHeader
        title={t('title')}
        requirements={['DASH-03', 'FR-27']}
        actions={
          <Button size="sm" variant="outline" className="shrink-0 bg-background/90 shadow-sm" onClick={() => load(true)}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {t('refresh')}
          </Button>
        }
      />

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('reports.volume.title')}
          value={vol ? Number(vol.summary.started).toLocaleString() : '—'}
          hint={vol ? t('stats.startedHint', { closed: Number(vol.summary.closed), escalated: Number(vol.summary.escalated) }) : undefined}
          icon={<ClipboardList className="size-6" />}
          tone="blue"
        />
        <StatTile
          label={t('stats.overrideRate')}
          value={ovr && ovr.summary.overrideRate !== null ? `${ovr.summary.overrideRate}%` : '—'}
          hint={ovr ? t('stats.overrideHint', { overridden: Number(ovr.summary.overridden), decided: Number(ovr.summary.accepted) + Number(ovr.summary.overridden) }) : undefined}
          icon={<ChartPie className="size-6" />}
          tone="green"
        />
        <StatTile
          label={t('reports.time.title')}
          value={tim ? fmtSeconds(tim.summary.avgTotalSec as number | null) : '—'}
          hint={tim ? t('stats.timeHint', { p95: fmtSeconds(tim.summary.p95TotalSec as number | null), intake: fmtSeconds(tim.summary.avgIntakeSec as number | null) }) : undefined}
          icon={<Clock3 className="size-6" />}
          tone="amber"
        />
        <StatTile
          label={`${t('classifications.elevated_risk')}+`}
          value={cls && elevatedRate !== null ? `${elevatedRate}%` : '—'}
          hint={cls ? `${elevatedCount.toLocaleString(locale)} / ${scored.toLocaleString(locale)} ${t('monthly.scored').toLocaleLowerCase(locale)}` : undefined}
          icon={<TrendingUp className="size-6" />}
          tone="violet"
        />
      </div>

      <section id="monthly-classification" className="data-panel scroll-mt-20">
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-heading font-semibold">{t('monthly.title')}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('monthly.description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Client comment 50: the same month data as a bar chart, a pie or a table, chosen by the viewer. */}
            <div className="inline-flex rounded-lg bg-muted/60 p-0.5" role="group" aria-label={t('monthly.viewLabel')}>
              <Button size="sm" variant={view === 'chart' ? 'default' : 'ghost'} aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
                <ChartNoAxesColumn data-icon="inline-start" aria-hidden="true" />
                {t('views.chart')}
              </Button>
              <Button size="sm" variant={view === 'pie' ? 'default' : 'ghost'} aria-pressed={view === 'pie'} onClick={() => setView('pie')}>
                <ChartPie data-icon="inline-start" aria-hidden="true" />
                {t('views.pie')}
              </Button>
              <Button size="sm" variant={view === 'table' ? 'default' : 'ghost'} aria-pressed={view === 'table'} onClick={() => setView('table')}>
                <Table2 data-icon="inline-start" aria-hidden="true" />
                {t('views.table')}
              </Button>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-sm">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
              {t('monthly.window')}
            </span>
          </div>
        </div>
        <div className="p-4">
          {monthlyClassification === null ? (
            <div className="grid h-64 place-items-center rounded-xl bg-muted/20" role="status">
              <div className="space-y-2 text-center">
                <span className="mx-auto block size-7 animate-pulse rounded-full border-2 border-primary/25 border-t-primary" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t('loading')}</p>
              </div>
            </div>
          ) : selectedMonthData ? (
            <>
              {/* Client comment 49: a month's classification counts are selectable and labelled. */}
              <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t('monthly.selectedMonth', { month: selectedMonthData.label })}>
                {selectedMonthData.segments.map((segment) => {
                  const status = STATUS[segment.key] ?? { color: 'var(--s9)', icon: '●' };
                  const count = segment.value === null ? t('monthly.notAvailable') : segment.value.toLocaleString(locale);
                  return (
                    <button
                      key={segment.key}
                      type="button"
                      className="rounded-lg border px-3 py-2 text-left outline-none transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ borderColor: `color-mix(in srgb, ${status.color} 30%, transparent)`, background: `color-mix(in srgb, ${status.color} 7%, transparent)` }}
                      aria-label={t('monthly.segmentDetail', { classification: segment.label, month: selectedMonthData.label, count })}
                      aria-pressed={selectedClassification === segment.key}
                      onClick={() => setSelectedClassification((current) => (current === segment.key ? null : (segment.key as ClassificationKey)))}
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: status.color }}>
                        <span aria-hidden="true">{status.icon}</span>
                        <span className="text-foreground">{segment.label}</span>
                      </span>
                      <strong className="mt-1 block text-lg tabular-nums" style={{ color: status.color }}>
                        {count}
                      </strong>
                    </button>
                  );
                })}
              </div>
              {view === 'pie' ? (
                <>
                  {/* The bar chart carries its own month selection; the pie shows one month, so it needs these. */}
                  <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t('monthly.monthLabel')}>
                    {stackedClassificationMonths.map((month) => (
                      <Button
                        key={month.key}
                        size="sm"
                        variant={month.key === selectedMonthData.key ? 'default' : 'outline'}
                        aria-pressed={month.key === selectedMonthData.key}
                        onClick={() => setSelectedMonth(month.key)}
                      >
                        {month.label}
                      </Button>
                    ))}
                  </div>
                  <PieChart
                    rows={selectedMonthData.segments.map((segment) => ({ key: segment.key, label: segment.label, value: segment.value ?? 0 }))}
                    title={t('monthly.pieTitle', { month: selectedMonthData.label })}
                    totalLabel={t('total')}
                  />
                </>
              ) : view === 'table' ? (
                <div className="overflow-hidden rounded-xl border">
                  <Table containerLabel={t('monthly.chartTitle')}>
                    <caption className="sr-only">{t('monthly.chartTitle')}</caption>
                    <TableHeader className="bg-muted/45">
                      <TableRow>
                        <TableHead>{t('monthly.columns.month')}</TableHead>
                        {CLASSIFICATION_KEYS.map((classification) => (
                          <TableHead key={classification} className="text-right">
                            {t(`classifications.${classification}`)}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">{t('monthly.columns.total')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stackedClassificationMonths.map((month) => (
                        <TableRow key={month.key} data-state={month.key === selectedMonthData.key ? 'selected' : undefined}>
                          <TableCell>
                            <button
                              type="button"
                              className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                              aria-pressed={month.key === selectedMonthData.key}
                              aria-label={t('monthly.selectMonth', { month: month.label, total: month.total ?? 0 })}
                              onClick={() => setSelectedMonth(month.key)}
                            >
                              {month.label}
                            </button>
                          </TableCell>
                          {month.segments.map((segment) => (
                            <TableCell key={segment.key} className="text-right tabular-nums">
                              {segment.value === null ? t('monthly.notAvailable') : segment.value.toLocaleString(locale)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold tabular-nums">
                            {month.total === null ? t('monthly.notAvailable') : month.total.toLocaleString(locale)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <StackedClassificationChart
                  months={stackedClassificationMonths}
                  title={t('monthly.chartTitle')}
                  selectedMonth={selectedMonthData.key}
                  selectedClassification={selectedClassification}
                  onMonthSelect={setSelectedMonth}
                  onSegmentSelect={(month, classification) => {
                    setSelectedMonth(month);
                    setSelectedClassification((current) => (current === classification && selectedMonthData.key === month ? null : (classification as ClassificationKey)));
                  }}
                  selectMonthLabel={(month, total) => t('monthly.selectMonth', { month, total })}
                />
              )}

              {selectedClassification && selectedSegment ? (
                <section className="mt-5 overflow-hidden rounded-xl border bg-background" aria-labelledby="classification-drilldown-title">
                  <div className="flex flex-col gap-3 border-b bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 id="classification-drilldown-title" className="font-heading text-sm font-semibold">
                        {t('monthly.segmentDetail', {
                          classification: selectedSegment.label,
                          month: selectedMonthData.label,
                          count: (selectedSegment.value ?? 0).toLocaleString(locale),
                        })}
                      </h3>
                      {drilldown.status === 'ready' && drilldown.items.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {reviewT('pagination.range', {
                            first: 1,
                            last: drilldown.items.length,
                            total: selectedSegment.value ?? drilldown.items.length,
                          })}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={commonT('close')}
                      onClick={() => setSelectedClassification(null)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>

                  {drilldown.status === 'loading' || drilldown.status === 'idle' ? (
                    <p className="grid min-h-28 place-items-center text-sm text-muted-foreground" role="status">{t('loading')}</p>
                  ) : drilldown.status === 'error' ? (
                    <p className="m-4 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{drilldown.error}</p>
                  ) : drilldown.items.length === 0 ? (
                    <p className="grid min-h-28 place-items-center text-sm text-muted-foreground" role="status">{reviewT('empty.filtered')}</p>
                  ) : (
                    <Table
                      containerLabel={t('monthly.segmentDetail', {
                        classification: selectedSegment.label,
                        month: selectedMonthData.label,
                        count: selectedSegment.value ?? 0,
                      })}
                    >
                      <caption className="sr-only">
                        {t('monthly.segmentDetail', {
                          classification: selectedSegment.label,
                          month: selectedMonthData.label,
                          count: selectedSegment.value ?? 0,
                        })}
                      </caption>
                      <TableHeader className="bg-muted/35">
                        <TableRow>
                          <TableHead>{reviewT('columns.started')}</TableHead>
                          <TableHead>{reviewT('columns.requestor')}</TableHead>
                          <TableHead>{reviewT('columns.department')}</TableHead>
                          <TableHead>{reviewT('columns.personaScenario')}</TableHead>
                          <TableHead>{reviewT('columns.status')}</TableHead>
                          <TableHead>{reviewT('columns.classification')}</TableHead>
                          <TableHead className="text-right">{reviewT('columns.confidence')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drilldown.items.map((item) => {
                          const classification = finalClassification(item);
                          return (
                            <TableRow key={item._id}>
                              <TableCell className="whitespace-nowrap text-xs">{dateFormatter.format(new Date(item.createdAt))}</TableCell>
                              <TableCell>
                                <span className="block font-medium">{item.requestor?.name ?? item.requestorId}</span>
                                {item.requestor?.email ? <span className="block text-xs text-muted-foreground">{item.requestor.email}</span> : null}
                              </TableCell>
                              <TableCell>{item.department?.name ?? '—'}</TableCell>
                              <TableCell>
                                <span className="block font-medium">{item.personaKey ? formatIdentifierLabel(item.personaKey) : '—'}</span>
                                <span className="block text-xs text-muted-foreground">{item.scenarioKey ? formatIdentifierLabel(item.scenarioKey) : '—'}</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{statusT.has(item.status) ? statusT(item.status) : formatIdentifierLabel(item.status)}</Badge>
                              </TableCell>
                              <TableCell>{classification ? selectedSegment.label : '—'}</TableCell>
                              <TableCell className="text-right tabular-nums">{item.result ? `${item.result.confidence}%` : '—'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <p className="grid h-64 place-items-center text-sm text-muted-foreground" role="status">
              {t('monthly.empty')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/** Keep direct navigation consistent with the feature-filtered rail and Standard Reports route. */
export default function AnalyticsPage() {
  const t = useTranslations('admin.analytics');
  const workspace = useWorkspace();

  if (!workspace?.features.reports) {
    return (
      <div className="page-shell">
        <Card className="mx-auto w-full max-w-2xl">
          <CardHeader className="items-center text-center">
            <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldX className="size-5" aria-hidden="true" />
            </span>
            <h1 className="font-heading text-xl font-semibold tracking-tight">{t('featureGate.deniedTitle')}</h1>
            <CardDescription className="max-w-lg leading-6">{t('featureGate.deniedDescription')}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button nativeButton={false} variant="outline" render={<Link href="/admin" />}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              {t('featureGate.back')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return <AnalyticsDashboard />;
}
