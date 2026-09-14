'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  { value: '30d', label: 'Last 30 days', days: 30, interval: 'day' as const },
  { value: '90d', label: 'Last 90 days', days: 90, interval: 'week' as const },
  { value: '12m', label: 'Last 12 months', days: 365, interval: 'month' as const },
];
const BY = [
  { value: 'department', label: 'Department' },
  { value: 'persona', label: 'Persona' },
  { value: 'scenario', label: 'Scenario' },
];
const TYPES: ReportType[] = ['volume', 'classification', 'override-rate', 'assessment-time'];

/** One report block: chart / table toggle + CSV / PDF export (FR-28: the export is the table view). */
function ReportPanel({ type, title, description, result, query, children }: { type: ReportType; title: string; description: string; result: ReportResult | null; query: ReportQuery; children: React.ReactNode }) {
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
            Chart
          </Button>
          <Button size="sm" variant={view === 'table' ? 'default' : 'ghost'} onClick={() => setView('table')}>
            Table
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
        <p className="text-sm text-muted-foreground">Loading…</p>
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
          {result.cached ? 'Cached' : 'Computed'} {new Date(result.generatedAt).toLocaleTimeString()} · {result.computeMs} ms
        </p>
      )}
    </section>
  );
}

/** DASH-03 analytics dashboard (PAID `reports`): the four FR-26 standard reports + FR-27 trends, with filters and exports. */
export default function AnalyticsPage() {
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

  const departmentOptions = [{ value: ANY, label: 'All departments' }, ...departments.map((d) => ({ value: d._id, label: d.name }))];
  const personaOptions = [{ value: ANY, label: 'All personas' }, ...personas.map((p) => ({ value: p.key, label: p.name }))];

  return (
    <div className="space-y-4">
      <ChartStyles />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Standard reports (volume, classification, override rate, assessment time) and trends. Cached for an hour; exports match the table view exactly.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(true)}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <Select items={RANGES} value={range} onValueChange={(v) => setRange(v ?? '12m')}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Department</Label>
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
          <Label className="text-xs">Persona</Label>
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
          <Label className="text-xs">Trends by</Label>
          <Select items={BY} value={by} onValueChange={(v) => setBy((v as typeof by) ?? 'department')}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BY.map((o) => (
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
        <StatTile label="Started" value={vol ? Number(vol.summary.started).toLocaleString() : '—'} hint={vol ? `${vol.summary.closed} closed · ${vol.summary.escalated} escalated` : undefined} />
        <StatTile label="Scored" value={cls ? Number(cls.summary.scored).toLocaleString() : '—'} hint={cls ? `${cls.summary.ruleDriven} rule-driven · ${cls.summary.professionalConsult} professional consult` : undefined} />
        <StatTile label="Override rate" value={ovr && ovr.summary.overrideRate !== null ? `${ovr.summary.overrideRate}%` : '—'} hint={ovr ? `${ovr.summary.overridden} of ${Number(ovr.summary.accepted) + Number(ovr.summary.overridden)} decided` : undefined} />
        <StatTile label="Accept rate" value={ovr && ovr.summary.acceptRate !== null ? `${ovr.summary.acceptRate}%` : '—'} hint="Accuracy proxy (BRD §12, target 75%)" />
        <StatTile label="Median time" value={tim ? fmtSeconds(tim.summary.medianTotalSec as number | null) : '—'} hint={tim ? `p95 ${fmtSeconds(tim.summary.p95TotalSec as number | null)} · intake ${fmtSeconds(tim.summary.avgIntakeSec as number | null)}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPanel type="volume" title="Assessment volume" description="Assessments started per period; the table splits them by current status." result={vol ?? null} query={query}>
          {vol && <BarChart title="Assessments started per period" data={vol.rows.map((r) => ({ label: String(r.period), value: Number(r.started) }))} />}
        </ReportPanel>
        <ReportPanel type="classification" title="Classification distribution" description="Final class (a human override wins over the AI recommendation)." result={cls ?? null} query={query}>
          {cls && <StatusBars rows={cls.rows.map((r) => ({ key: String(r.classification), count: Number(r.count), share: r.share === null ? null : Number(r.share) }))} />}
          {cls && <p className="mt-2 text-xs text-muted-foreground">{Object.values(STATUS).map((s) => `${s.icon} ${s.label}`).join(' · ')} — ordered by severity.</p>}
        </ReportPanel>
        <ReportPanel type="override-rate" title="Override rate" description="Share of decided assessments where the human changed the classification. Override reasons (FR-23) are in the table export." result={ovr ?? null} query={query}>
          {ovr && <LineChart title="Override rate per period" unit="%" periods={ovr.rows.map((r) => String(r.period))} series={[{ name: 'Override rate', values: ovr.rows.map((r) => (r.overrideRate === null ? null : Number(r.overrideRate))) }]} format={(v) => `${v}%`} />}
        </ReportPanel>
        <ReportPanel type="assessment-time" title="Assessment time" description="Median and p95 total duration from start to close, per period." result={tim ?? null} query={query}>
          {tim && (
            <LineChart
              title="Assessment duration per period (minutes)"
              periods={tim.rows.map((r) => String(r.period))}
              series={[
                { name: 'Median', values: tim.rows.map((r) => (r.medianTotalSec === null ? null : Number(r.medianTotalSec) / 60)) },
                { name: 'p95', values: tim.rows.map((r) => (r.p95TotalSec === null ? null : Number(r.p95TotalSec) / 60)) },
              ]}
              format={(v) => `${Math.round(v)} min`}
            />
          )}
        </ReportPanel>
      </div>

      <section className="space-y-2 rounded-md border p-4">
        <div>
          <h2 className="font-semibold">Trends by {by}</h2>
          <p className="text-xs text-muted-foreground">Assessments per period for each {by} (top 8; the rest folded into “other”). Cached for an hour (FR-27).</p>
        </div>
        {trends ? (
          trendSeries.series.length ? (
            <LineChart title={`Assessments per period by ${by}`} periods={trendSeries.periods} series={trendSeries.series} />
          ) : (
            <p className="text-sm text-muted-foreground">No assessments in this range.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {trends && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Table view</summary>
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
