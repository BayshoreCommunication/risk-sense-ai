'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, ClipboardCheck, Clock3, FileSearch, Fingerprint, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { assessments, type AssessmentListResult } from '@/lib/assessments';
import { auditApi, type AuditLogEntry } from '@/lib/audit';
import { toApiError } from '@/lib/api/client';

/** Read-only audit command center built entirely from tenant-scoped assessment and audit-log reads. */
export default function AuditOverviewPage() {
  const locale = useLocale();
  const t = useTranslations('audit.overview');
  const status = useTranslations('status');
  const [assessmentData, setAssessmentData] = useState<AssessmentListResult | null>(null);
  const [events, setEvents] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([assessments.list({ sort: 'newest', limit: 5, page: 1 }), auditApi.list({ limit: 7 })])
      .then(([assessmentResult, auditResult]) => {
        if (!active) return;
        if (assessmentResult.status === 'fulfilled') setAssessmentData(assessmentResult.value);
        if (auditResult.status === 'fulfilled') setEvents(auditResult.value.items);
        const failure = assessmentResult.status === 'rejected' ? assessmentResult.reason : auditResult.status === 'rejected' ? auditResult.reason : null;
        setError(failure ? toApiError(failure).message : null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const counts = assessmentData?.counts;
  const metrics = [
    { label: t('metrics.total'), value: assessmentData?.total ?? 0, icon: ClipboardCheck, tone: 'text-blue-700 bg-blue-500/10' },
    { label: t('metrics.open'), value: counts?.pending ?? 0, icon: Clock3, tone: 'text-amber-700 bg-amber-500/10' },
    { label: t('metrics.closed'), value: counts?.closed ?? 0, icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-500/10' },
    { label: t('metrics.attention'), value: counts?.error_review ?? 0, icon: TriangleAlert, tone: 'text-rose-700 bg-rose-500/10' },
  ];

  return (
    <div className="page-shell">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['FR-24', 'FR-26']}
        actions={
          <>
            <Button nativeButton={false} variant="outline" render={<Link href="/audit/logs" />}><Fingerprint aria-hidden="true" />{t('actions.logs')}</Button>
            <Button nativeButton={false} render={<Link href="/audit/assessments" />}><FileSearch aria-hidden="true" />{t('actions.assessments')}</Button>
          </>
        }
      />

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</div>}

      <section className="data-panel grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4" aria-label={t('metrics.label')}>
        {metrics.map((metric) => (
          <div key={metric.label} className="grid min-h-28 grid-cols-[1fr_auto] items-start gap-4 p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                <p className="metric-value mt-3">{loading ? '—' : metric.value}</p>
              </div>
              <span className={`grid size-9 place-items-center rounded-lg ${metric.tone}`}><metric.icon className="size-4" aria-hidden="true" /></span>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('recentAssessments.title')}</CardTitle>
            <CardDescription>{t('recentAssessments.description')}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {loading && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('loading')}</p>}
            {!loading && (assessmentData?.items.length ?? 0) === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('recentAssessments.empty')}</p>}
            <div className="divide-y">
              {assessmentData?.items.map((item) => (
                <div key={item._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.requestor?.name ?? t('unknownRequestor')}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.personaKey?.replace(/_/g, ' ') ?? '—'} · {new Date(item.createdAt).toLocaleString(locale)}</p>
                  </div>
                  <Badge variant="secondary">{status.has(item.status) ? status(item.status) : item.status}</Badge>
                </div>
              ))}
            </div>
            <div className="border-t px-5 pt-4">
              <Button nativeButton={false} variant="ghost" render={<Link href="/audit/assessments" />}>{t('recentAssessments.viewAll')}<ArrowRight aria-hidden="true" /></Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('recentEvents.title')}</CardTitle>
            <CardDescription>{t('recentEvents.description')}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {loading && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('loading')}</p>}
            {!loading && events.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('recentEvents.empty')}</p>}
            <div className="divide-y">
              {events.map((event) => (
                <div key={event._id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{event.action}</p>
                    <span className="font-mono text-xs text-muted-foreground">#{event.seq}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.category} · {new Date(event.createdAt).toLocaleString(locale)}</p>
                </div>
              ))}
            </div>
            <div className="border-t px-5 pt-4">
              <Button nativeButton={false} variant="ghost" render={<Link href="/audit/logs" />}>{t('recentEvents.viewAll')}<ArrowRight aria-hidden="true" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
