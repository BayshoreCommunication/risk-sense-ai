'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, BarChart3, Clock3, FileDown, LoaderCircle, PieChart, RefreshCcw, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/shell/PageHeader';
import { ReportsWorkspace } from '@/components/analytics/ReportsWorkspace';
import { api, toApiError } from '@/lib/api/client';
import { reports, saveBlob, type ReportType } from '@/lib/reports';

const REPORTS = [
  { key: 'volume', type: 'volume' as ReportType, icon: BarChart3, tone: 'bg-blue-500/10 text-blue-700', note: 'bg-blue-500/8 text-blue-900/80' },
  { key: 'classification', type: 'classification' as ReportType, icon: PieChart, tone: 'bg-emerald-500/10 text-emerald-700', note: 'bg-emerald-500/8 text-emerald-900/80' },
  { key: 'override', type: 'override-rate' as ReportType, icon: RefreshCcw, tone: 'bg-amber-500/10 text-amber-700', note: 'bg-amber-500/8 text-amber-900/80' },
  { key: 'time', type: 'assessment-time' as ReportType, icon: Clock3, tone: 'bg-violet-500/10 text-violet-700', note: 'bg-violet-500/8 text-violet-900/80' },
] as const;

/** A report row with its CSV and PDF exports, as docs/design/figma-frames/18-admin-standard-reports.png. */
function ReportRow({ report }: { report: (typeof REPORTS)[number] }) {
  const t = useTranslations('admin.standardReports');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: 'csv' | 'pdf') {
    setBusy(format);
    setError(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 365 * 86400e3);
      const { blob, name } = await reports.export(report.type, format, { from: from.toISOString(), to: to.toISOString(), interval: 'month' });
      saveBlob(blob, name);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="grid grid-cols-[auto_1fr_auto] items-center gap-5">
        <span className={`grid size-14 place-items-center rounded-xl ${report.tone}`}>
          <report.icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold tracking-[-0.01em]">
            <Link href={`#report-${report.key}`} className="hover:underline">
              {t(`reports.${report.key}.title`)}
            </Link>
          </h2>
          <CardDescription className="mt-1">{t(`reports.${report.key}.scope`)}</CardDescription>
          <p className={`mt-2 rounded-lg px-3 py-1.5 text-xs leading-5 ${report.note}`}>{t(`reports.${report.key}.description`)}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void download('csv')}>
            <FileDown data-icon="inline-start" aria-hidden="true" />
            CSV
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void download('pdf')}>
            <FileDown data-icon="inline-start" aria-hidden="true" />
            PDF
          </Button>
        </div>
      </CardHeader>
      {error ? (
        <CardFooter>
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        </CardFooter>
      ) : null}
    </Card>
  );
}

/**
 * FR-26 standard reports with their FR-28 exports. The report list follows the Figma frame; the
 * chart / pie / table views below it are client comment 50, and the trend breakdown is FR-27.
 */
export default function StandardReportsPage() {
  const t = useTranslations('admin.standardReports');
  const [gate, setGate] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading');
  const [gateError, setGateError] = useState<string | null>(null);

  const verifyReportsAccess = useCallback(async () => {
    setGate('loading');
    setGateError(null);
    const result = await api.GET('/me');
    if (!result.data) {
      setGateError(toApiError(result.error).message);
      setGate('error');
      return;
    }
    setGate(result.data.data.tenant.features.reports ? 'allowed' : 'denied');
  }, []);

  useEffect(() => {
    void verifyReportsAccess();
  }, [verifyReportsAccess]);

  if (gate !== 'allowed') {
    return (
      <div className="page-shell">
        <Card className="mx-auto w-full max-w-2xl">
          <CardHeader className="items-center text-center">
            <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              {gate === 'loading' ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <ShieldX className="size-5" aria-hidden="true" />}
            </span>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              {gate === 'loading' ? t('featureGate.loadingTitle') : gate === 'denied' ? t('featureGate.deniedTitle') : t('featureGate.errorTitle')}
            </h1>
            <CardDescription className="max-w-lg leading-6">
              {gate === 'loading' ? t('featureGate.loadingDescription') : gate === 'denied' ? t('featureGate.deniedDescription') : gateError ?? t('featureGate.errorDescription')}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href="/admin" />}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              {t('featureGate.back')}
            </Button>
            {gate === 'error' ? <Button onClick={() => void verifyReportsAccess()}>{t('featureGate.retry')}</Button> : null}
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader title={t('title')} description={t('description')} requirements={['FR-26', 'FR-28']} />

      <section className="grid gap-4" aria-label={t('listLabel')}>
        {REPORTS.map((report) => (
          <ReportRow key={report.key} report={report} />
        ))}
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50/55 p-4 text-xs leading-5 text-blue-950/75">{t('note')}</div>

      <ReportsWorkspace />
    </div>
  );
}
