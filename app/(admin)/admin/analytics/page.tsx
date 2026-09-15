'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart, ChartStyles, LineChart, STATUS, StatTile, StatusBars } from '@/components/analytics/Charts';
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
function ReportPanel({ type, title, description, result, query, children }: { type: ReportType; title: string; description: string; result: ReportResult | null; query: ReportQuery; children: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations('admin.analytics');
  const [view, setView] = useState<'chart' | 'table'>('chart');
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
    <section className="space-y-2 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={view === 'chart' ? 'default' : 'ghost'} onClick={() => setView('chart')}>
            {t('views.chart')}
          </Button>
          <Button size="sm" variant={view === 'table' ? 'default' : 'ghost'} onClick={() => setView('table')}>
            {t('views.table')}
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null || !result} onClick={() => void download('csv')}>
            {busy === 'csv' ? '…' : 'CSV'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null || !result} onClick={() => void download('pdf')}>
            {busy === 'pdf' ? '…' : 'PDF'}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!result ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : view === 'chart' ? (
        children
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
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
      {result && (
        <p className="text-[11px] text-muted-foreground">
          {result.cached ? t('cache.cached') : t('cache.computed')} {new Date(result.generatedAt).toLocaleTimeString(locale)} · {result.computeMs} {t('milliseconds')}
        </p>
      )}
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
    <div className="space-y-4">
      <ChartStyles />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(true)}>
          {t('refresh')}
        </Button>
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
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
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label={t('stats.started')} value={vol ? Number(vol.summary.started).toLocaleString() : '—'} hint={vol ? t('stats.startedHint', { closed: Number(vol.summary.closed), escalated: Number(vol.summary.escalated) }) : undefined} />
        <StatTile label={t('stats.scored')} value={cls ? Number(cls.summary.scored).toLocaleString() : '—'} hint={cls ? t('stats.scoredHint', { ruleDriven: Number(cls.summary.ruleDriven), professionalConsult: Number(cls.summary.professionalConsult) }) : undefined} />
        <StatTile label={t('stats.overrideRate')} value={ovr && ovr.summary.overrideRate !== null ? `${ovr.summary.overrideRate}%` : '—'} hint={ovr ? t('stats.overrideHint', { overridden: Number(ovr.summary.overridden), decided: Number(ovr.summary.accepted) + Number(ovr.summary.overridden) }) : undefined} />
        <StatTile label={t('stats.acceptRate')} value={ovr && ovr.summary.acceptRate !== null ? `${ovr.summary.acceptRate}%` : '—'} hint={t('stats.acceptHint')} />
        <StatTile label={t('stats.medianTime')} value={tim ? fmtSeconds(tim.summary.medianTotalSec as number | null) : '—'} hint={tim ? t('stats.timeHint', { p95: fmtSeconds(tim.summary.p95TotalSec as number | null), intake: fmtSeconds(tim.summary.avgIntakeSec as number | null) }) : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPanel type="volume" title={t('reports.volume.title')} description={t('reports.volume.description')} result={vol ?? null} query={query}>
          {vol && <BarChart title={t('reports.volume.chartTitle')} data={vol.rows.map((r) => ({ label: String(r.period), value: Number(r.started) }))} />}
        </ReportPanel>
        <ReportPanel type="classification" title={t('reports.classification.title')} description={t('reports.classification.description')} result={cls ?? null} query={query}>
          {cls && <StatusBars rows={cls.rows.map((r) => ({ key: String(r.classification), count: Number(r.count), share: r.share === null ? null : Number(r.share) }))} />}
          {cls && <p className="mt-2 text-xs text-muted-foreground">{Object.entries(STATUS).map(([key, value]) => `${value.icon} ${t(`classifications.${key}`)}`).join(' · ')} — {t('reports.classification.ordered')}</p>}
        </ReportPanel>
        <ReportPanel type="override-rate" title={t('reports.override.title')} description={t('reports.override.description')} result={ovr ?? null} query={query}>
          {ovr && <LineChart title={t('reports.override.chartTitle')} unit="%" periods={ovr.rows.map((r) => String(r.period))} series={[{ name: t('reports.override.series'), values: ovr.rows.map((r) => (r.overrideRate === null ? null : Number(r.overrideRate))) }]} format={(v) => `${v}%`} />}
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

      <section className="space-y-2 rounded-md border p-4">
        <div>
          <h2 className="font-semibold">{t('trends.title', { group: t(`groups.${by}`) })}</h2>
          <p className="text-xs text-muted-foreground">{t('trends.description', { group: t(`groups.${by}`).toLocaleLowerCase() })}</p>
        </div>
        {trends ? (
          trendSeries.series.length ? (
            <LineChart title={t('trends.chartTitle', { group: t(`groups.${by}`).toLocaleLowerCase() })} periods={trendSeries.periods} series={trendSeries.series} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('trends.empty')}</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        )}
        {trends && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t('views.tableView')}</summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
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
          </details>
        )}
      </section>
    </div>
  );
}
