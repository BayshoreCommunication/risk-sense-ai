'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, ChartNoAxesColumn, ChartPie, FileDown, RefreshCw, SlidersHorizontal, Table2 } from 'lucide-react';
import { BarChart, ChartStyles, LineChart, PieChart, STATUS, StatTile, StatusBars } from '@/components/analytics/Charts';
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

/** One report block: chart / table toggle + CSV / PDF export (FR-28: the export is the table view). */
function ReportPanel({ type, title, description, result, query, children, pie }: { type: ReportType; title: string; description: string; result: ReportResult | null; query: ReportQuery; children: React.ReactNode; pie?: React.ReactNode }) {
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
    <section className="data-panel">
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
  const [range, setRange] = useState('12m');
  const [by, setBy] = useState<'department' | 'persona' | 'scenario'>('department');
  const [departmentId, setDepartmentId] = useState(ANY);
  const [personaKey, setPersonaKey] = useState(ANY);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [personas, setPersonas] = useState<{ key: string; name: string }[]>([]);
  const [data, setData] = useState<Partial<Record<ReportType | 'trends', ReportResult>>>({});
  const [error, setError] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');

  const query = useMemo<ReportQuery>(() => {
    const r = RANGES.find((x) => x.value === range) ?? RANGES[2]!;
    const to = new Date();
    const from = new Date(to.getTime() - r.days * 86400e3);
    return { from: from.toISOString(), to: to.toISOString(), interval: r.interval, ...(departmentId !== ANY ? { departmentId } : {}), ...(personaKey !== ANY ? { personaKey } : {}) };
  }, [range, departmentId, personaKey]);

  useEffect(() => {
    assessments.departments().then(setDepartments).catch(() => setDepartments([]));
    assessments.personas().then(setPersonas).catch(() => setPersonas([]));
  }, []);

  const load = useCallback(
    (refresh = false) => {
      setData({});
      setError(null);
      const q: ReportQuery = refresh ? { ...query, refresh: 'true' } : query;
      for (const t of TYPES) reports.get(t, q).then((r) => setData((d) => ({ ...d, [t]: r }))).catch((e) => setError(toApiError(e).message));
      reports.trends({ ...q, by }).then((r) => setData((d) => ({ ...d, trends: r }))).catch((e) => setError(toApiError(e).message));
    },
    [query, by],
  );
  useEffect(() => load(), [load]);

  const vol = data.volume;
  const cls = data.classification;
  const ovr = data['override-rate'];
  const tim = data['assessment-time'];
  const trends = data.trends;
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
      <header className="workspace-header">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-3xl items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-700">
              <BarChart3 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t('description')}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 bg-background/90 shadow-sm" onClick={() => load(true)}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {t('refresh')}
          </Button>
        </div>
      </header>

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

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPanel type="volume" title={t('reports.volume.title')} description={t('reports.volume.description')} result={vol ?? null} query={query}>
          {vol && <BarChart title={t('reports.volume.chartTitle')} data={vol.rows.map((r) => ({ label: String(r.period), value: Number(r.started) }))} />}
        </ReportPanel>
        <ReportPanel
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
        <ReportPanel type="override-rate" title={t('reports.override.title')} description={t('reports.override.description')} result={ovr ?? null} query={query}>
          {ovr && <LineChart title={t('reports.override.chartTitle')} periods={ovr.rows.map((r) => String(r.period))} series={[{ name: t('reports.override.series'), values: ovr.rows.map((r) => (r.overrideRate === null ? null : Number(r.overrideRate))) }]} format={(v) => `${v}%`} />}
        </ReportPanel>
        <ReportPanel type="assessment-time" title={t('reports.time.title')} description={t('reports.time.description')} result={tim ?? null} query={query}>
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
