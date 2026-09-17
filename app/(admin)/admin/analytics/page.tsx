'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChartNoAxesColumn, ChartPie, RefreshCw, Table2 } from 'lucide-react';
import { ChartStyles, PieChart, STATUS, StackedClassificationChart, StatTile, type StackedClassificationMonth } from '@/components/analytics/Charts';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { fmtSeconds, reports, type ReportQuery, type ReportResult, type ReportType } from '@/lib/reports';

const SUMMARY_TYPES: ReportType[] = ['volume', 'classification', 'override-rate', 'assessment-time'];
const CLASSIFICATION_KEYS = ['monitor_only', 'risk', 'elevated_risk', 'issue'] as const;
type ClassificationKey = (typeof CLASSIFICATION_KEYS)[number];
type MonthlyClassificationResult = { key: string; total: number | null; values: Record<ClassificationKey, number | null> };

function lastFiveCompleteMonths(reference = new Date()) {
  const currentMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  return Array.from({ length: 5 }, (_, index) => {
    const from = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - (5 - index), 1));
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return { key: from.toISOString().slice(0, 7), from: from.toISOString(), to: new Date(next.getTime() - 1).toISOString() };
  });
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
export default function AnalyticsPage() {
  const t = useTranslations('admin.analytics');
  const locale = useLocale();
  const [data, setData] = useState<Partial<Record<ReportType, ReportResult>>>({});
  const [monthlyClassification, setMonthlyClassification] = useState<MonthlyClassificationResult[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedClassification, setSelectedClassification] = useState<ClassificationKey | null>(null);
  // Client comment 50: the viewer self-selects how the same month data is presented.
  const [view, setView] = useState<'chart' | 'pie' | 'table'>('chart');
  const [error, setError] = useState<string | null>(null);

  // Headline metrics cover the trailing twelve months; the chart covers the five complete months the frame shows.
  const summaryQuery = useMemo<ReportQuery>(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - 365 * 86400e3).toISOString(), to: to.toISOString(), interval: 'month' };
  }, []);

  const load = useCallback(
    (refresh = false) => {
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
      const window = lastFiveCompleteMonths();
      reports
        .trends({ from: window[0]!.from, to: window.at(-1)!.to, interval: 'month', by: 'classification', ...(refresh ? { refresh: 'true' } : {}) })
        .then((result) => {
          const months = monthsFromTrends(window.map((month) => month.key), result);
          setMonthlyClassification(months);
          setSelectedMonth((current) => (current && months.some((month) => month.key === current) ? current : (months.at(-1)?.key ?? null)));
        })
        .catch((e) => {
          setMonthlyClassification([]);
          setError(toApiError(e).message);
        });
    },
    [summaryQuery],
  );
  useEffect(() => load(), [load]);

  const vol = data.volume;
  const cls = data.classification;
  const ovr = data['override-rate'];
  const tim = data['assessment-time'];

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

      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('stats.started')}
          value={vol ? Number(vol.summary.started).toLocaleString() : '—'}
          hint={vol ? t('stats.startedHint', { closed: Number(vol.summary.closed), escalated: Number(vol.summary.escalated) }) : undefined}
        />
        <StatTile
          label={t('stats.scored')}
          value={cls ? Number(cls.summary.scored).toLocaleString() : '—'}
          hint={cls ? t('stats.scoredHint', { ruleDriven: Number(cls.summary.ruleDriven), professionalConsult: Number(cls.summary.professionalConsult) }) : undefined}
        />
        <StatTile
          label={t('stats.overrideRate')}
          value={ovr && ovr.summary.overrideRate !== null ? `${ovr.summary.overrideRate}%` : '—'}
          hint={ovr ? t('stats.overrideHint', { overridden: Number(ovr.summary.overridden), decided: Number(ovr.summary.accepted) + Number(ovr.summary.overridden) }) : undefined}
        />
        <StatTile
          label={t('stats.medianTime')}
          value={tim ? fmtSeconds(tim.summary.medianTotalSec as number | null) : '—'}
          hint={tim ? t('stats.timeHint', { p95: fmtSeconds(tim.summary.p95TotalSec as number | null), intake: fmtSeconds(tim.summary.avgIntakeSec as number | null) }) : undefined}
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
            <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-800">{t('monthly.window')}</span>
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
                  <Table>
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
