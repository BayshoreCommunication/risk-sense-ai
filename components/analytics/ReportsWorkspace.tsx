'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChartNoAxesColumn,
  ChartPie,
  ChevronDown,
  Clock3,
  FileDown,
  RefreshCw,
  SlidersHorizontal,
  Table2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { BarChart, ChartStyles, LineChart, PieChart, STATUS, StatusBars } from '@/components/analytics/Charts';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { assessments, type Department } from '@/lib/assessments';
import { formatIdentifierLabel } from '@/lib/format-identifier-label';
import { fmtCell, reports, saveBlob, type ReportQuery, type ReportResult, type ReportType } from '@/lib/reports';

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

const REPORT_CONFIG: {
  type: ReportType;
  id: string;
  messageKey: 'volume' | 'classification' | 'override' | 'time';
  icon: LucideIcon;
  tone: string;
  calloutTone: string;
}[] = [
  { type: 'volume', id: 'report-volume', messageKey: 'volume', icon: ChartNoAxesColumn, tone: 'bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300', calloutTone: 'border-blue-200/70 bg-blue-50 text-blue-950/75 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-100/85' },
  { type: 'classification', id: 'report-classification', messageKey: 'classification', icon: ChartPie, tone: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300', calloutTone: 'border-emerald-200/70 bg-emerald-50 text-emerald-950/75 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100/85' },
  { type: 'override-rate', id: 'report-override', messageKey: 'override', icon: UserRound, tone: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300', calloutTone: 'border-amber-200/70 bg-amber-50 text-amber-950/75 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100/85' },
  { type: 'assessment-time', id: 'report-time', messageKey: 'time', icon: Clock3, tone: 'bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300', calloutTone: 'border-violet-200/70 bg-violet-50 text-violet-950/75 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-100/85' },
];

type Loadable<T> =
  | { status: 'idle' | 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: string };

const idle = <T,>(): Loadable<T> => ({ status: 'idle', data: null, error: null });
const initialReports = () => Object.fromEntries(REPORT_CONFIG.map(({ type }) => [type, idle<ReportResult>()])) as Record<ReportType, Loadable<ReportResult>>;

function ReportFilter({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Select items={options} value={value} onValueChange={(next) => onChange(next ?? options[0]!.value)}>
        <SelectTrigger id={id} size="sm" className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ResultTable({ result, title, positiveCountsOnly = false, formatGroupIdentifiers = false }: { result: ReportResult; title: string; positiveCountsOnly?: boolean; formatGroupIdentifiers?: boolean }) {
  const rows = positiveCountsOnly ? result.rows.filter((row) => Number(row.count) > 0) : result.rows;
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table containerLabel={title}>
        <caption className="sr-only">{title}</caption>
        <TableHeader className="bg-muted">
          <TableRow>{result.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {result.columns.map((column) => {
                const value = fmtCell(row[column.key], column.kind);
                return <TableCell key={column.key}>{formatGroupIdentifiers && column.key === 'group' && value !== '—' ? formatIdentifierLabel(value) : value}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** A compact Figma report row that reveals the live chart/table workspace on demand. */
function ReportPanel({
  id,
  type,
  title,
  scope,
  callout,
  description,
  icon: Icon,
  tone,
  calloutTone,
  state,
  query,
  expanded,
  onToggle,
  onRetry,
  children,
  pie,
}: {
  id: string;
  type: ReportType;
  title: string;
  scope: string;
  callout: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  calloutTone: string;
  state: Loadable<ReportResult>;
  query: ReportQuery;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  children: ReactNode;
  pie?: ReactNode;
}) {
  const t = useTranslations('admin.analytics');
  const commonT = useTranslations('common');
  const [view, setView] = useState<'chart' | 'pie' | 'table'>('chart');
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const contentId = `${id}-content`;
  const titleId = `${id}-title`;

  async function download(format: 'csv' | 'pdf') {
    setBusy(format);
    setExportError(null);
    try {
      const { blob, name } = await reports.export(type, format, query);
      saveBlob(blob, name);
    } catch (downloadError) {
      setExportError(toApiError(downloadError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id={id} className="data-panel scroll-mt-20" aria-labelledby={titleId}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-4 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-labelledby={titleId}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onToggle}
        >
          <span className={`grid size-14 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden="true">
            <Icon className="size-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span id={titleId} role="heading" aria-level={2} className="block font-heading font-semibold">{title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{scope}</span>
            <span className={`mt-2 block max-w-xl rounded-md border px-2.5 py-1 text-xs ${calloutTone}`}>{callout}</span>
          </span>
          <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          {(['csv', 'pdf'] as const).map((format) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              disabled={busy !== null}
              aria-label={`${title} · ${format.toUpperCase()}`}
              onClick={() => void download(format)}
            >
              <FileDown data-icon="inline-start" aria-hidden="true" />
              {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {exportError ? <p className="mx-4 mb-4 rounded-lg border border-destructive/25 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{exportError}</p> : null}

      {expanded ? (
        <div id={contentId} className="border-t p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
            <div className="inline-flex self-start rounded-lg bg-muted/60 p-0.5" role="group" aria-label={`${title} · ${t('views.tableView')}`}>
              <Button size="sm" variant={view === 'chart' ? 'default' : 'ghost'} aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
                <ChartNoAxesColumn data-icon="inline-start" aria-hidden="true" />{t('views.chart')}
              </Button>
              {pie ? (
                <Button size="sm" variant={view === 'pie' ? 'default' : 'ghost'} aria-pressed={view === 'pie'} onClick={() => setView('pie')}>
                  <ChartPie data-icon="inline-start" aria-hidden="true" />{t('views.pie')}
                </Button>
              ) : null}
              <Button size="sm" variant={view === 'table' ? 'default' : 'ghost'} aria-pressed={view === 'table'} onClick={() => setView('table')}>
                <Table2 data-icon="inline-start" aria-hidden="true" />{t('views.table')}
              </Button>
            </div>
          </div>

          {state.status === 'idle' || state.status === 'loading' ? (
            <p className="grid h-52 place-items-center text-sm text-muted-foreground" role="status">{t('loading')}</p>
          ) : state.status === 'error' ? (
            <div className="grid min-h-40 place-items-center rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-center">
              <div>
                <p className="text-sm text-destructive" role="alert">{state.error}</p>
                <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />{commonT('retry')}
                </Button>
              </div>
            </div>
          ) : view === 'table' ? <ResultTable result={state.data!} title={title} /> : view === 'pie' && pie ? pie : children}
        </div>
      ) : null}
    </section>
  );
}

/** Four FR-26 report rows with live expandable views, FR-28 exports and a collapsed FR-27 trend explorer. */
export function ReportsWorkspace() {
  const t = useTranslations('admin.analytics');
  const standardT = useTranslations('admin.standardReports');
  const commonT = useTranslations('common');
  const [range, setRange] = useState('12m');
  const [by, setBy] = useState<'department' | 'persona' | 'scenario'>('department');
  const [departmentId, setDepartmentId] = useState(ANY);
  const [personaKey, setPersonaKey] = useState(ANY);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [personas, setPersonas] = useState<{ key: string; name: string }[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedReport, setExpandedReport] = useState<ReportType | null>(null);
  const [reportStates, setReportStates] = useState<Record<ReportType, Loadable<ReportResult>>>(initialReports);
  const reportGeneration = useRef(0);
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');
  const [trendState, setTrendState] = useState<Loadable<ReportResult>>(idle);
  const trendGeneration = useRef(0);

  const query = useMemo<ReportQuery>(() => {
    const selectedRange = RANGES.find((option) => option.value === range) ?? RANGES[2]!;
    const to = new Date();
    const from = new Date(to.getTime() - selectedRange.days * 86400e3);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      interval: selectedRange.interval,
      ...(departmentId !== ANY ? { departmentId } : {}),
      ...(personaKey !== ANY ? { personaKey } : {}),
    };
  }, [range, departmentId, personaKey]);

  useEffect(() => {
    void Promise.all([assessments.departments(), assessments.personas()])
      .then(([nextDepartments, nextPersonas]) => {
        setDepartments(nextDepartments);
        setPersonas(nextPersonas);
      })
      .catch(() => {
        setDepartments([]);
        setPersonas([]);
      });
  }, []);

  useEffect(() => {
    reportGeneration.current += 1;
    setReportStates(initialReports());
  }, [query]);

  useEffect(() => {
    trendGeneration.current += 1;
    setTrendState(idle());
  }, [query, by]);

  const loadReport = useCallback(async (type: ReportType) => {
    const generation = reportGeneration.current;
    setReportStates((current) => ({ ...current, [type]: { status: 'loading', data: null, error: null } }));
    try {
      const result = await reports.get(type, query);
      if (generation !== reportGeneration.current) return;
      setReportStates((current) => ({ ...current, [type]: { status: 'ready', data: result, error: null } }));
    } catch (loadError) {
      if (generation !== reportGeneration.current) return;
      setReportStates((current) => ({ ...current, [type]: { status: 'error', data: null, error: toApiError(loadError).message } }));
    }
  }, [query]);

  useEffect(() => {
    if (expandedReport && reportStates[expandedReport].status === 'idle') void loadReport(expandedReport);
  }, [expandedReport, loadReport, reportStates]);

  const loadTrends = useCallback(async () => {
    const generation = trendGeneration.current;
    setTrendState({ status: 'loading', data: null, error: null });
    try {
      const result = await reports.trends({ ...query, by });
      if (generation !== trendGeneration.current) return;
      setTrendState({ status: 'ready', data: result, error: null });
    } catch (loadError) {
      if (generation !== trendGeneration.current) return;
      setTrendState({ status: 'error', data: null, error: toApiError(loadError).message });
    }
  }, [by, query]);

  useEffect(() => {
    if (trendsOpen && trendState.status === 'idle') void loadTrends();
  }, [loadTrends, trendState.status, trendsOpen]);

  const trendSeries = useMemo(() => {
    if (trendState.status !== 'ready') return { periods: [] as string[], series: [] as { name: string; values: (number | null)[] }[] };
    const names = String(trendState.data.summary.series ?? '').split('|').filter(Boolean);
    const periods = [...new Set(trendState.data.rows.map((row) => String(row.period)))];
    return {
      periods,
      series: names.map((name) => ({
        name: by === 'persona' || by === 'scenario' ? formatIdentifierLabel(name) : name,
        values: periods.map((period) => {
          const row = trendState.data.rows.find((candidate) => candidate.period === period && candidate.group === name);
          return row ? Number(row.count) : 0;
        }),
      })),
    };
  }, [by, trendState]);

  const rangeOptions = RANGES.map((option) => ({ value: option.value, label: t(`ranges.${option.key}`) }));
  const byOptions = BY.map((option) => ({ value: option.value, label: t(`groups.${option.key}`) }));
  const departmentOptions = [{ value: ANY, label: t('filters.allDepartments') }, ...departments.map((department) => ({ value: department._id, label: department.name }))];
  const personaOptions = [{ value: ANY, label: t('filters.allPersonas') }, ...personas.map((persona) => ({ value: persona.key, label: persona.name }))];

  const reportResult = (type: ReportType) => reportStates[type].status === 'ready' ? reportStates[type].data : null;
  const volume = reportResult('volume');
  const classification = reportResult('classification');
  const overrideRate = reportResult('override-rate');
  const assessmentTime = reportResult('assessment-time');

  const visualization = (type: ReportType) => {
    if (type === 'volume' && volume) {
      return <BarChart title={t('reports.volume.chartTitle')} data={volume.rows.map((row) => ({ label: String(row.period), value: Number(row.started) }))} />;
    }
    if (type === 'classification' && classification) {
      return (
        <>
          <StatusBars rows={classification.rows.map((row) => ({ key: String(row.classification), count: Number(row.count), share: row.share === null ? null : Number(row.share) }))} />
          <p className="mt-2 text-xs text-muted-foreground">
            {Object.entries(STATUS).map(([key, value]) => `${value.icon} ${t(`classifications.${key}`)}`).join(' · ')} — {t('reports.classification.ordered')}
          </p>
        </>
      );
    }
    if (type === 'override-rate' && overrideRate) {
      return <LineChart title={t('reports.override.chartTitle')} periods={overrideRate.rows.map((row) => String(row.period))} series={[{ name: t('reports.override.series'), values: overrideRate.rows.map((row) => row.overrideRate === null ? null : Number(row.overrideRate)) }]} format={(value) => `${value}%`} />;
    }
    if (type === 'assessment-time' && assessmentTime) {
      return <LineChart title={t('reports.time.chartTitle')} periods={assessmentTime.rows.map((row) => String(row.period))} series={[{ name: t('reports.time.median'), values: assessmentTime.rows.map((row) => row.medianTotalSec === null ? null : Number(row.medianTotalSec) / 60) }, { name: 'p95', values: assessmentTime.rows.map((row) => row.p95TotalSec === null ? null : Number(row.p95TotalSec) / 60) }]} format={(value) => t('minutesShort', { value: Math.round(value) })} />;
    }
    return null;
  };

  const classificationPie = classification ? (
    <PieChart
      title={t('reports.classification.pieTitle')}
      totalLabel={t('total')}
      rows={classification.rows.map((row) => ({ key: String(row.classification), label: t(`classifications.${String(row.classification)}`), value: Number(row.count) }))}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <ChartStyles />

      <section className="control-strip">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={filtersOpen}
          aria-controls="report-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          <span className="flex-1">{t('filters.period')}</span>
          <span className="text-xs font-normal text-muted-foreground">{rangeOptions.find((option) => option.value === range)?.label}</span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {filtersOpen ? (
          <div id="report-filters" className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportFilter id="report-range" label={t('filters.period')} options={rangeOptions} value={range} onChange={setRange} />
            <ReportFilter id="report-department" label={t('filters.department')} options={departmentOptions} value={departmentId} onChange={setDepartmentId} />
            <ReportFilter id="report-persona" label={t('filters.persona')} options={personaOptions} value={personaKey} onChange={setPersonaKey} />
            <ReportFilter id="report-trends-by" label={t('filters.trendsBy')} options={byOptions} value={by} onChange={(next) => setBy(next as typeof by)} />
          </div>
        ) : null}
      </section>

      <div className="space-y-3" aria-label={standardT('listLabel')}>
        {REPORT_CONFIG.map((config) => {
          const title = standardT(`reports.${config.messageKey}.title`);
          return (
            <ReportPanel
              key={config.type}
              {...config}
              title={title}
              scope={standardT(`reports.${config.messageKey}.scope`)}
              callout={standardT(`reports.${config.messageKey}.description`)}
              description={t(`reports.${config.messageKey}.description`)}
              state={reportStates[config.type]}
              query={query}
              expanded={expandedReport === config.type}
              onToggle={() => setExpandedReport((current) => current === config.type ? null : config.type)}
              onRetry={() => void loadReport(config.type)}
              pie={config.type === 'classification' ? classificationPie : undefined}
            >
              {visualization(config.type)}
            </ReportPanel>
          );
        })}
      </div>

      <section className="data-panel">
        <button
          type="button"
          className="flex w-full items-center gap-3 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-expanded={trendsOpen}
          aria-controls="report-trends-content"
          onClick={() => setTrendsOpen((open) => !open)}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><ChartNoAxesColumn className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading font-semibold">{t('trends.title', { group: t(`groups.${by}`) })}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t('trends.description', { group: t(`groups.${by}`).toLocaleLowerCase() })}</span>
          </span>
          <ChevronDown className={`size-5 text-muted-foreground transition-transform ${trendsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {trendsOpen ? (
          <div id="report-trends-content" className="border-t p-4">
            <div className="mb-4 inline-flex rounded-lg bg-muted/60 p-0.5" role="group" aria-label={t('views.tableView')}>
              <Button size="sm" variant={trendView === 'chart' ? 'default' : 'ghost'} aria-pressed={trendView === 'chart'} onClick={() => setTrendView('chart')}><ChartNoAxesColumn data-icon="inline-start" aria-hidden="true" />{t('views.chart')}</Button>
              <Button size="sm" variant={trendView === 'table' ? 'default' : 'ghost'} aria-pressed={trendView === 'table'} onClick={() => setTrendView('table')}><Table2 data-icon="inline-start" aria-hidden="true" />{t('views.table')}</Button>
            </div>

            {trendState.status === 'idle' || trendState.status === 'loading' ? (
              <p className="grid h-52 place-items-center text-sm text-muted-foreground" role="status">{t('loading')}</p>
            ) : trendState.status === 'error' ? (
              <div className="grid min-h-40 place-items-center rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-center">
                <div><p className="text-sm text-destructive" role="alert">{trendState.error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void loadTrends()}><RefreshCw data-icon="inline-start" aria-hidden="true" />{commonT('retry')}</Button></div>
              </div>
            ) : trendSeries.series.length === 0 ? (
              <p className="grid h-52 place-items-center text-sm text-muted-foreground" role="status">{t('trends.empty')}</p>
            ) : trendView === 'chart' ? (
              <LineChart title={t('trends.chartTitle', { group: t(`groups.${by}`).toLocaleLowerCase() })} periods={trendSeries.periods} series={trendSeries.series} />
            ) : <ResultTable result={trendState.data!} title={t('trends.title', { group: t(`groups.${by}`) })} positiveCountsOnly formatGroupIdentifiers={by === 'persona' || by === 'scenario'} />}
          </div>
        ) : null}
      </section>
    </div>
  );
}
