'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, LoaderCircle, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/shell/PageHeader';
import { ReportsWorkspace } from '@/components/analytics/ReportsWorkspace';
import { api, toApiError } from '@/lib/api/client';

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

      <div className="rounded-xl border border-blue-200 bg-blue-50/55 p-4 text-xs leading-5 text-blue-950/75">{t('note')}</div>

      <ReportsWorkspace />
    </div>
  );
}
