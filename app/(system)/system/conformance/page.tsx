'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, FileWarning, History, ScanSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shell/PageHeader';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';

type ConformanceRun = components['schemas']['ConformanceRun'];
type ConformanceFlag = {
  _id?: string;
  assessmentId: unknown;
  issues: { path: string; message: string }[];
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt?: string | null;
};

function errorMessage(result: { error?: unknown }) {
  return toApiError(result.error).message;
}

function idText(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '$oid' in value && typeof (value as { $oid?: unknown }).$oid === 'string') return (value as { $oid: string }).$oid;
  return String(value ?? 'unknown');
}

/** Persistent schema and invariant scan for stored assessment records (FR-30, AI-01, FR-08). */
export default function ConformancePage() {
  const locale = useLocale();
  const t = useTranslations('system.conformance');
  const [runs, setRuns] = useState<ConformanceRun[]>([]);
  const [flags, setFlags] = useState<ConformanceFlag[]>([]);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [lastRun, setLastRun] = useState<ConformanceRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [runsResult, flagsResult] = await Promise.all([
      api.GET('/system/conformance/runs'),
      api.GET('/system/conformance/flags', { params: { query: { includeResolved: includeResolved ? 'true' : 'false' } } }),
    ]);
    setLoading(false);
    if (!runsResult.data) {
      setError(errorMessage(runsResult as { error?: unknown }));
      return;
    }
    if (!flagsResult.data) {
      setError(errorMessage(flagsResult as { error?: unknown }));
      return;
    }
    setRuns(runsResult.data.data);
    setFlags(flagsResult.data.data as unknown as ConformanceFlag[]);
  }, [includeResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runScan() {
    setRunning(true);
    setError(null);
    const result = await api.POST('/system/conformance/run');
    setRunning(false);
    setConfirmRun(false);
    if (!result.data) {
      setError(errorMessage(result as { error?: unknown }));
      return;
    }
    setLastRun(result.data.data);
    await load();
  }

  const summary = lastRun ?? runs[0] ?? null;

  return (
    <div className="page-shell">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['FR-30', 'AI-01']}
        actions={
          !confirmRun ? (
            <Button onClick={() => setConfirmRun(true)} disabled={running}><ScanSearch aria-hidden="true" />{t('runScan')}</Button>
          ) : (
            <div className="flex max-w-xl flex-wrap items-center justify-end gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2">
              <span className="text-xs">{t('confirmation')}</span>
              <Button size="sm" onClick={() => void runScan()} disabled={running}>{running ? t('scanning') : t('confirmScan')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRun(false)} disabled={running}>{t('cancel')}</Button>
            </div>
          )
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>{t('retry')}</Button>
        </div>
      )}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Card size="sm"><CardHeader><CardTitle className="text-2xl tabular-nums">{summary.scanned}</CardTitle><CardDescription>{t('summary.scanned')}</CardDescription></CardHeader></Card>
          <Card size="sm"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-2xl tabular-nums">{summary.valid}</CardTitle><CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" /></div><CardDescription>{t('summary.valid')}</CardDescription></CardHeader></Card>
          <Card size="sm"><CardHeader><div className="flex items-center justify-between"><CardTitle className={summary.flagged ? 'text-destructive text-2xl tabular-nums' : 'text-2xl tabular-nums'}>{summary.flagged}</CardTitle><FileWarning className="size-4 text-rose-700" aria-hidden="true" /></div><CardDescription>{t('summary.flagged')}</CardDescription></CardHeader></Card>
          <Card size="sm"><CardHeader><CardTitle className="text-2xl tabular-nums">{summary.resolved}</CardTitle><CardDescription>{t('summary.resolved')}</CardDescription></CardHeader></Card>
        </div>
      ) : !loading ? (
        <Card size="sm"><CardContent className="text-sm text-muted-foreground">{t('summary.empty')}</CardContent></Card>
      ) : null}

      <section className="data-panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-medium">{t('flags.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('flags.description')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeResolved} onChange={(event) => setIncludeResolved(event.target.checked)} />
            {t('flags.includeResolved')}
          </label>
        </div>
        <div className="divide-y rounded-lg border md:hidden">
          {loading && <p className="p-8 text-center text-sm text-muted-foreground">{t('flags.loading')}</p>}
          {!loading && !error && flags.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{includeResolved ? t('flags.emptyAll') : t('flags.emptyOpen')}</p>}
          {flags.map((flag) => {
            const assessmentId = idText(flag.assessmentId);
            return (
              <article key={`mobile-${flag._id ?? assessmentId}`} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3"><code className="break-all text-xs">{assessmentId}</code><Badge variant={flag.resolvedAt ? 'outline' : 'destructive'}>{flag.resolvedAt ? t('flags.resolved') : t('flags.open')}</Badge></div>
                <ul className="space-y-1 text-xs">{flag.issues.map((issue) => <li key={`${issue.path}:${issue.message}`}><code>{issue.path}</code>: {issue.message}</li>)}</ul>
                <p className="text-xs text-muted-foreground">{new Date(flag.firstDetectedAt).toLocaleString(locale)} – {new Date(flag.lastDetectedAt).toLocaleString(locale)}</p>
              </article>
            );
          })}
        </div>
        <div className="hidden rounded-xl border md:block">
          <Table containerLabel={t('flags.title')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('flags.columns.assessment')}</TableHead>
                <TableHead>{t('flags.columns.issues')}</TableHead>
                <TableHead>{t('flags.columns.firstDetected')}</TableHead>
                <TableHead>{t('flags.columns.lastDetected')}</TableHead>
                <TableHead>{t('flags.columns.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t('flags.loading')}</TableCell></TableRow>}
              {!loading && !error && flags.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{includeResolved ? t('flags.emptyAll') : t('flags.emptyOpen')}</TableCell></TableRow>
              )}
              {flags.map((flag) => {
                const assessmentId = idText(flag.assessmentId);
                return (
                  <TableRow key={flag._id ?? assessmentId}>
                    <TableCell><code>{assessmentId}</code></TableCell>
                    <TableCell className="min-w-80 whitespace-normal">
                      <ul className="space-y-1">
                        {flag.issues.map((issue) => <li key={`${issue.path}:${issue.message}`}><code>{issue.path}</code>: {issue.message}</li>)}
                      </ul>
                    </TableCell>
                    <TableCell>{new Date(flag.firstDetectedAt).toLocaleString(locale)}</TableCell>
                    <TableCell>{new Date(flag.lastDetectedAt).toLocaleString(locale)}</TableCell>
                    <TableCell><Badge variant={flag.resolvedAt ? 'outline' : 'destructive'}>{flag.resolvedAt ? t('flags.resolved') : t('flags.open')}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="data-panel space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 font-medium"><History className="size-4 text-primary" aria-hidden="true" />{t('runs.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('runs.description')}</p>
        </div>
        <div className="divide-y rounded-lg border md:hidden">
          {!loading && runs.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('runs.empty')}</p>}
          {runs.map((run) => (
            <article key={`mobile-${run.ranAt}:${run.trigger}`} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{run.trigger}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(run.ranAt).toLocaleString(locale)}</p></div><Badge variant="outline">{t('runs.duration', { value: run.durationMs })}</Badge></div>
              <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">{t('runs.columns.scanned')}</dt><dd className="font-semibold tabular-nums">{run.scanned}</dd></div><div><dt className="text-muted-foreground">{t('runs.columns.valid')}</dt><dd className="font-semibold tabular-nums">{run.valid}</dd></div><div><dt className="text-muted-foreground">{t('runs.columns.flagged')}</dt><dd className="font-semibold tabular-nums">{run.flagged}</dd></div><div><dt className="text-muted-foreground">{t('runs.columns.resolved')}</dt><dd className="font-semibold tabular-nums">{run.resolved}</dd></div></dl>
            </article>
          ))}
        </div>
        <div className="hidden rounded-xl border md:block">
          <Table containerLabel={t('runs.title')}>
            <TableHeader><TableRow><TableHead>{t('runs.columns.when')}</TableHead><TableHead>{t('runs.columns.trigger')}</TableHead><TableHead className="text-right">{t('runs.columns.scanned')}</TableHead><TableHead className="text-right">{t('runs.columns.valid')}</TableHead><TableHead className="text-right">{t('runs.columns.flagged')}</TableHead><TableHead className="text-right">{t('runs.columns.resolved')}</TableHead><TableHead className="text-right">{t('runs.columns.duration')}</TableHead></TableRow></TableHeader>
            <TableBody>
              {!loading && runs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{t('runs.empty')}</TableCell></TableRow>}
              {runs.map((run) => (
                <TableRow key={`${run.ranAt}:${run.trigger}`}>
                  <TableCell>{new Date(run.ranAt).toLocaleString(locale)}</TableCell>
                  <TableCell>{run.trigger}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.scanned}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.valid}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.flagged}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.resolved}</TableCell>
                  <TableCell className="text-right tabular-nums">{t('runs.duration', { value: run.durationMs })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
