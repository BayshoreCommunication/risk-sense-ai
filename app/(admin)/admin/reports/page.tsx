'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowUpRight, BarChart3, Clock3, FileDown, LoaderCircle, PieChart, RefreshCcw, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shell/PageHeader';
import { api, toApiError } from '@/lib/api/client';

const REPORTS = [
  { key: 'volume', icon: BarChart3, tone: 'bg-blue-500/10 text-blue-700' },
  { key: 'classification', icon: PieChart, tone: 'bg-violet-500/10 text-violet-700' },
  { key: 'override', icon: RefreshCcw, tone: 'bg-amber-500/10 text-amber-700' },
  { key: 'time', icon: Clock3, tone: 'bg-emerald-500/10 text-emerald-700' },
] as const;

/** FR-26/FR-28 Figma index; live chart/table views and matching exports stay in Analytics. */
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
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['FR-26', 'FR-28']}
      />

      <section className="grid gap-4 md:grid-cols-2" aria-label={t('listLabel')}>
        {REPORTS.map((report) => (
          <Card key={report.key} className="min-h-56">
            <CardHeader className="grid grid-cols-[1fr_auto] gap-4">
              <div>
                <CardTitle>{t(`reports.${report.key}.title`)}</CardTitle>
                <CardDescription className="mt-1.5 leading-5">{t(`reports.${report.key}.scope`)}</CardDescription>
              </div>
              <span className={`grid size-10 place-items-center rounded-lg ${report.tone}`}>
                <report.icon className="size-5" aria-hidden="true" />
              </span>
            </CardHeader>
            <CardContent className="mt-auto">
              <p className="text-sm leading-6 text-muted-foreground">{t(`reports.${report.key}.description`)}</p>
            </CardContent>
            <CardFooter className="justify-between gap-3 bg-muted/25">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label={t('formatsLabel')}>
                <FileDown className="size-3.5" aria-hidden="true" />
                <Badge variant="outline">CSV</Badge>
                <Badge variant="outline">PDF</Badge>
              </div>
              <Button nativeButton={false} size="sm" render={<Link href={`/admin/analytics#report-${report.key}`} />}>
                {t('open')}
                <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50/55 p-4 text-xs leading-5 text-blue-950/75">
        {t('note')}
      </div>
    </div>
  );
}
