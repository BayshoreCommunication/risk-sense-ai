'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChartNoAxesColumn, ChartPie, FileDown, RefreshCw, SlidersHorizontal, Table2 } from 'lucide-react';
import {
  BarChart,
  ChartStyles,
  LineChart,
  PieChart,
  STATUS,
  StackedClassificationChart,
  StatTile,
  StatusBars,
  type StackedClassificationMonth,
} from '@/components/analytics/Charts';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { assessments, type Department } from '@/lib/assessments';
import { fmtCell, fmtSeconds, reports, saveBlob, type ReportQuery, type ReportResult, type ReportType } from '@/lib/reports';

const ANY = '__any';
const RANGES = [
  { value: '30d', key: 'days30', days: 30, interval: 'day' as const },
  { value: '90d', key: 'days90', days: 90, interval: 'week' as const },
  { value: '12m', key: 'months12', days: 365, interval: 'month' as const },
];
const BY = [
  { value: 'department', key: 'department' },
  { value: 'persona', key: 'persona' },
  { value: 'scenario', key: 'scenario' },
];
const TYPES: ReportType[] = ['volume', 'classification', 'override-rate', 'assessment-time'];
const CLASSIFICATION_KEYS = ['monitor_only', 'risk', 'elevated_risk', 'issue'] as const;
type ClassificationKey = (typeof CLASSIFICATION_KEYS)[number];
type MonthlyClassificationResult = { key: string; total: number | null; values: Record<ClassificationKey, number | null> };

function lastFiveCompleteMonths(reference = new Date()) {
  const currentMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  return Array.from({ length: 5 }, (_, index) => {
    const from = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - (5 - index), 1));
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return {
      key: from.toISOString().slice(0, 7),
      from: from.toISOString(),
      to: new Date(next.getTime() - 1).toISOString(),
    };
  });
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeClassificationMonth(key: string, result: ReportResult): MonthlyClassificationResult {
  const rowsByClassification = new Map(result.rows.map((row) => [String(row.classification), row]));
  return {
    key,
    total: finiteNumber(result.summary.scored),
    values: Object.fromEntries(
      CLASSIFICATION_KEYS.map((classification) => [classification, finiteNumber(rowsByClassification.get(classification)?.count)]),
    ) as Record<ClassificationKey, number | null>,
  };
}

/** One report block: chart / table toggle + CSV / PDF export (FR-28: the export is the table view). */
function ReportPanel({ id, type, title, description, result, query, children, pie }: { id: string; type: ReportType; title: string; description: string; result: ReportResult | null; query: ReportQuery; children: React.ReactNode; pie?: React.ReactNode }) {
  const t = useTranslations('admin.analytics');
  const [view, setView] = useState<'chart' | 'pie' | 'table'>('chart');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function download(format: 'csv' | 'pdf') {
    setBusy(format);
    setError(null);
    try {
      const { blob, name } = await reports.export(type, format, query);
      saveBlob(blob, name);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section id={id} className="data-panel scroll-mt-20">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="font-heading font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5">
            <Button size="sm" variant={view === 'chart' ? 'default' : 'ghost'} aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
              <ChartNoAxesColumn data-icon="inline-start" aria-hidden="true" />
              {t('views.chart')}
            </Button>
            {pie && (
              <Button size="sm" variant={view === 'pie' ? 'default' : 'ghost'} aria-pressed={view === 'pie'} onClick={() => setView('pie')}>
                <ChartPie data-icon="inline-start" aria-hidden="true" />
                {t('views.pie')}
              </Button>
            )}
            <Button size="sm" variant={view === 'table' ? 'default' : 'ghost'} aria-pressed={view === 'table'} onClick={() => setView('table')}>
              <Table2 data-icon="inline-start" aria-hidden="true" />
              {t('views.table')}
            </Button>
          </div>
          <Button size="sm" variant="outline" disabled={busy !== null || !result} onClick={() => void download('csv')}>
            <FileDown data-icon="inline-start" aria-hidden="true" />
            {busy === 'csv' ? '…' : 'CSV'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null || !result} onClick={() => void download('pdf')}>
            <FileDown data-icon="inline-start" aria-hidden="true" />
            {busy === 'pdf' ? '…' : 'PDF'}
          </Button>
        </div>
      </div>
      <div className="p-4">
        {error && <p className="mb-3 rounded-lg border border-destructive/25 bg-destructive/5 p-2 text-xs text-destructive" role="alert">{error}</p>}
        {!result ? (
          <div className="grid h-60 place-items-center rounded-xl bg-muted/20" role="status">
            <div className="space-y-2 text-center">
              <span className="mx-auto block size-7 animate-pulse rounded-full border-2 border-primary/25 border-t-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            </div>
          </div>
        ) : view === 'chart' ? (
          children
        ) : view === 'pie' && pie ? (
          pie
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader className="bg-muted/45">
              <TableRow>
                {result.columns.map((c) => (
                  <TableHead key={c.key} className={c.kind === 'text' ? '' : 'text-right'}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((r, i) => (
                <TableRow key={i}>
                  {result.columns.map((c) => (
                    <TableCell key={c.key} className={c.kind === 'text' ? '' : 'text-right tabular-nums'}>
                      {fmtCell(r[c.key], c.kind)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </div>
    </section>
  );
}

/** DASH-03 analytics dashboard (PAID `reports`): the four FR-26 standard reports + FR-27 trends, with filters and exports. */
export default function AnalyticsPage() {
  const t = useTranslations('admin.analytics');
  const locale = useLocale();
  const [range, setRange] = useState('12m');
  const [by, setBy] = useState<'department' | 'persona' | 'scenario'>('department');
  const [departmentId, setDepartmentId] = useState(ANY);
  const [personaKey, setPersonaKey] = useState(ANY);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [personas, setPersonas] = useState<{ key: string; name: string }[]>([]);
  const [data, setData] = useState<Partial<Record<ReportType | 'trends', ReportResult>>>({});
  const [monthlyClassification, setMonthlyClassification] = useState<MonthlyClassificationResult[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedClassification, setSelectedClassification] = useState<ClassificationKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');

  const query = useMemo<ReportQuery>(() => {
    const r = RANGES.find((x) => x.value === range) ?? RANGES[2]!;
    const to = new Date();
    const from = new Date(to.getTime() - r.days * 86400e3);
    return { from: from.toISOString(), to: to.toISOString(), interval: r.interval, ...(departmentId !== ANY ? { departmentId } : {}), ...(personaKey !== ANY ? { personaKey } : {}) };
  }, [range, departmentId, personaKey]);

  const classificationMonthQueries = useMemo(() => {
    const scope = {
      ...(departmentId !== ANY ? { departmentId } : {}),
      ...(personaKey !== ANY ? { personaKey } : {}),
    };
    return lastFiveCompleteMonths().map((month) => ({
      key: month.key,
      query: { from: month.from, to: month.to, interval: 'month' as const, ...scope },
    }));
  }, [departmentId, personaKey]);

  useEffect(() => {
    assessments.departments().then(setDepartments).catch(() => setDepartments([]));
    assessments.personas().then(setPersonas).catch(() => setPersonas([]));
  }, []);

  const load = useCallback(
    (refresh = false) => {
      setData({});
      setMonthlyClassification(null);
      setError(null);
      const q: ReportQuery = refresh ? { ...query, refresh: 'true' } : query;
      for (const t of TYPES) reports.get(t, q).then((r) => setData((d) => ({ ...d, [t]: r }))).catch((e) => setError(toApiError(e).message));
      reports.trends({ ...q, by }).then((r) => setData((d) => ({ ...d, trends: r }))).catch((e) => setError(toApiError(e).message));
      Promise.all(
        classificationMonthQueries.map(({ key, query: monthQuery }) =>
          reports
            .get('classification', refresh ? { ...monthQuery, refresh: 'true' } : monthQuery)
            .then((result) => normalizeClassificationMonth(key, result)),
        ),
      )
        .then((months) => {
          setMonthlyClassification(months);
          setSelectedMonth((current) => (current && months.some((month) => month.key === current) ? current : (months.at(-1)?.key ?? null)));
        })
        .catch((e) => {
          setMonthlyClassification([]);
          setError(toApiError(e).message);
        });
    },
    [query, by, classificationMonthQueries],
  );
  useEffect(() => load(), [load]);

  const vol = data.volume;
  const cls = data.classification;
  const ovr = data['override-rate'];
  const tim = data['assessment-time'];
  const trends = data.trends;
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    [locale],
  );
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
  const trendSeries = useMemo(() => {
    if (!trends) return { periods: [] as string[], series: [] as { name: string; values: (number | null)[] }[] };
    const names = String(trends.summary.series ?? '').split('|').filter(Boolean);
    const periods = [...new Set(trends.rows.map((r) => String(r.period)))];
    const series = names.map((name) => ({
      name,
      values: periods.map((p) => {
        const row = trends.rows.find((r) => r.period === p && r.group === name);
        return row ? Number(row.count) : 0;
      }),
    }));
    return { periods, series };
  }, [trends]);

  const rangeOptions = RANGES.map((option) => ({ ...option, label: t(`ranges.${option.key}`) }));
  const byOptions = BY.map((option) => ({ ...option, label: t(`groups.${option.key}`) }));
  const departmentOptions = [{ value: ANY, label: t('filters.allDepartments') }, ...departments.map((d) => ({ value: d._id, label: d.name }))];
  const personaOptions = [{ value: ANY, label: t('filters.allPersonas') }, ...personas.map((p) => ({ value: p.key, label: p.name }))];

  return (
    <div className="space-y-6">
      <ChartStyles />
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['DASH-03', 'FR-27']}
        actions={
          <Button size="sm" variant="outline" className="shrink-0 bg-background/90 shadow-sm" onClick={() => load(true)}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {t('refresh')}
          </Button>
        }
      />

      <section className="control-strip">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          <span>{t('filters.period')}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">{t('filters.period')}</Label>
          <Select items={rangeOptions} value={range} onValueChange={(v) => setRange(v ?? '12m')}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rangeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('filters.department')}</Label>
          <Select items={departmentOptions} value={departmentId} onValueChange={(v) => setDepartmentId(v ?? ANY)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departmentOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('filters.persona')}</Label>
          <Select items={personaOptions} value={personaKey} onValueChange={(v) => setPersonaKey(v ?? ANY)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {personaOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('filters.trendsBy')}</Label>
          <Select items={byOptions} value={by} onValueChange={(v) => setBy((v as typeof by) ?? 'department')}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {byOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </div>
      </section>
      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}

      <div className="grid overflow-hidden rounded-xl sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('stats.started')} value={vol ? Number(vol.summary.started).toLocaleString() : '—'} hint={vol ? t('stats.startedHint', { closed: Number(vol.summary.closed), escalated: Number(vol.summary.escalated) }) : undefined} />
        <StatTile label={t('stats.scored')} value={cls ? Number(cls.summary.scored).toLocaleString() : '—'} hint={cls ? t('stats.scoredHint', { ruleDriven: Number(cls.summary.ruleDriven), professionalConsult: Number(cls.summary.professionalConsult) }) : undefined} />
        <StatTile label={t('stats.overrideRate')} value={ovr && ovr.summary.overrideRate !== null ? `${ovr.summary.overrideRate}%` : '—'} hint={ovr ? t('stats.overrideHint', { overridden: Number(ovr.summary.overridden), decided: Number(ovr.summary.accepted) + Number(ovr.summary.overridden) }) : undefined} />
        <StatTile label={t('stats.medianTime')} value={tim ? fmtSeconds(tim.summary.medianTotalSec as number | null) : '—'} hint={tim ? t('stats.timeHint', { p95: fmtSeconds(tim.summary.p95TotalSec as number | null), intake: fmtSeconds(tim.summary.avgIntakeSec as number | null) }) : undefined} />
      </div>

      <section id="monthly-classification" className="data-panel scroll-mt-20">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-heading font-semibold">{t('monthly.title')}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('monthly.description')}</p>
          </div>
          <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-800">
            {t('monthly.window')}
          </span>
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
              <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/20 p-3.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="shrink-0">
                  <p className="text-xs font-medium text-muted-foreground">{t('monthly.selectedMonth', { month: selectedMonthData.label })}</p>
                  <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
                    {selectedMonthData.total === null ? '—' : selectedMonthData.total.toLocaleString(locale)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t('monthly.scored')}</p>
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label={t('monthly.selectedMonth', { month: selectedMonthData.label })}>
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
                        <strong className="mt-1 block text-lg tabular-nums" style={{ color: status.color }}>{count}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
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
            </>
          ) : (
            <p className="grid h-64 place-items-center text-sm text-muted-foreground" role="status">{t('monthly.empty')}</p>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPanel id="report-volume" type="volume" title={t('reports.volume.title')} description={t('reports.volume.description')} result={vol ?? null} query={query}>
          {vol && <BarChart title={t('reports.volume.chartTitle')} data={vol.rows.map((r) => ({ label: String(r.period), value: Number(r.started) }))} />}
        </ReportPanel>
        <ReportPanel
          id="report-classification"
          type="classification"
          title={t('reports.classification.title')}
          description={t('reports.classification.description')}
          result={cls ?? null}
          query={query}
          pie={cls ? <PieChart title={t('reports.classification.pieTitle')} totalLabel={t('total')} rows={cls.rows.map((r) => ({ key: String(r.classification), label: t(`classifications.${String(r.classification)}`), value: Number(r.count) }))} /> : null}
        >
          {cls && <StatusBars rows={cls.rows.map((r) => ({ key: String(r.classification), count: Number(r.count), share: r.share === null ? null : Number(r.share) }))} />}
          {cls && <p className="mt-2 text-xs text-muted-foreground">{Object.entries(STATUS).map(([key, value]) => `${value.icon} ${t(`classifications.${key}`)}`).join(' · ')} — {t('reports.classification.ordered')}</p>}
        </ReportPanel>
        <ReportPanel id="report-override" type="override-rate" title={t('reports.override.title')} description={t('reports.override.description')} result={ovr ?? null} query={query}>
          {ovr && <LineChart title={t('reports.override.chartTitle')} periods={ovr.rows.map((r) => String(r.period))} series={[{ name: t('reports.override.series'), values: ovr.rows.map((r) => (r.overrideRate === null ? null : Number(r.overrideRate))) }]} format={(v) => `${v}%`} />}
        </ReportPanel>
        <ReportPanel id="report-time" type="assessment-time" title={t('reports.time.title')} description={t('reports.time.description')} result={tim ?? null} query={query}>
          {tim && (
            <LineChart
              title={t('reports.time.chartTitle')}
              periods={tim.rows.map((r) => String(r.period))}
              series={[
                { name: t('reports.time.median'), values: tim.rows.map((r) => (r.medianTotalSec === null ? null : Number(r.medianTotalSec) / 60)) },
                { name: 'p95', values: tim.rows.map((r) => (r.p95TotalSec === null ? null : Number(r.p95TotalSec) / 60)) },
              ]}
              format={(v) => t('minutesShort', { value: Math.round(v) })}
            />
          )}
        </ReportPanel>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-heading font-semibold">{t('trends.title', { group: t(`groups.${by}`) })}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('trends.description', { group: t(`groups.${by}`).toLocaleLowerCase() })}</p>
          </div>
          <div className="inline-flex self-start rounded-lg bg-muted/60 p-0.5">
            <Button size="sm" variant={trendView === 'chart' ? 'default' : 'ghost'} aria-pressed={trendView === 'chart'} onClick={() => setTrendView('chart')}>
              <ChartNoAxesColumn data-icon="inline-start" aria-hidden="true" />
              {t('views.chart')}
            </Button>
            <Button size="sm" variant={trendView === 'table' ? 'default' : 'ghost'} aria-pressed={trendView === 'table'} onClick={() => setTrendView('table')}>
              <Table2 data-icon="inline-start" aria-hidden="true" />
              {t('views.table')}
            </Button>
          </div>
        </div>
        <div className="p-4">
          {trends ? (
            trendSeries.series.length ? (
              trendView === 'chart' ? (
                <LineChart title={t('trends.chartTitle', { group: t(`groups.${by}`).toLocaleLowerCase() })} periods={trendSeries.periods} series={trendSeries.series} />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <Table>
                    <TableHeader className="bg-muted/45">
                      <TableRow>
                        {trends.columns.map((c) => (
                          <TableHead key={c.key}>{c.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trends.rows
                        .filter((r) => Number(r.count) > 0)
                        .map((r, i) => (
                          <TableRow key={i}>
                            {trends.columns.map((c) => (
                              <TableCell key={c.key}>{fmtCell(r[c.key], c.kind)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : (
              <p className="grid h-56 place-items-center text-sm text-muted-foreground">{t('trends.empty')}</p>
            )
          ) : (
            <p className="grid h-56 place-items-center text-sm text-muted-foreground" role="status">{t('loading')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
