'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/shell/PageHeader';
import { useWorkspace } from '@/components/shell/workspace-context';
import { ReportsWorkspace } from '@/components/analytics/ReportsWorkspace';

/**
 * FR-26 standard reports with their FR-28 exports. The report list follows the Figma frame; the
 * chart / pie / table views below it are client comment 50, and the trend breakdown is FR-27.
 */
export default function StandardReportsPage() {
  const t = useTranslations('admin.standardReports');
  // The shell already verified GET /me and withholds children until it succeeds, so the feature map is
  // read from that verified answer instead of spending a second request on every visit (DecisionLog 44).
  // Server-side `requireFeature('reports')` remains the authority; this only decides what to render.
  const workspace = useWorkspace();

  if (!workspace?.features.reports) {
    return (
      <div className="page-shell">
        <Card className="mx-auto w-full max-w-2xl">
          <CardHeader className="items-center text-center">
            <span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldX className="size-5" aria-hidden="true" />
            </span>
            <h1 className="font-heading text-xl font-semibold tracking-tight">{t('featureGate.deniedTitle')}</h1>
            <CardDescription className="max-w-lg leading-6">{t('featureGate.deniedDescription')}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href="/admin" />}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              {t('featureGate.back')}
            </Button>
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
