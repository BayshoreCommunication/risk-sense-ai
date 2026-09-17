'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  Database,
  FileText,
  GitBranch,
  Info,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';
import { matricesApi, personasApi, questionsApi, rulesApi, scenariosApi, type Item } from '@/lib/admin/content';

type Dataset = components['schemas']['Dataset'];
type AreaKey = 'personas' | 'scenarios' | 'questions' | 'rules' | 'scoring' | 'datasets';
type Area = {
  href: string;
  key: AreaKey;
  icon: ComponentType<{ className?: string }>;
  tone: string;
};
type Snapshot = Record<Exclude<AreaKey, 'datasets'>, Item[]> & { datasets: Dataset[] };
type SourceKey = AreaKey | 'features';
type SourceState = 'loading' | 'available' | 'unavailable';
type Availability = Record<SourceKey, SourceState>;

const EMPTY_SNAPSHOT: Snapshot = { personas: [], scenarios: [], questions: [], rules: [], scoring: [], datasets: [] };
const LOADING_AVAILABILITY: Availability = {
  personas: 'loading',
  scenarios: 'loading',
  questions: 'loading',
  rules: 'loading',
  scoring: 'loading',
  datasets: 'loading',
  features: 'loading',
};

const ADMIN_AREAS: Area[] = [
  { href: '/admin/personas', key: 'personas', icon: BrainCircuit, tone: 'bg-violet-500/10 text-violet-700' },
  { href: '/admin/scenarios', key: 'scenarios', icon: GitBranch, tone: 'bg-sky-500/10 text-sky-700' },
  { href: '/admin/questions', key: 'questions', icon: ListChecks, tone: 'bg-cyan-500/10 text-cyan-700' },
  { href: '/admin/rules', key: 'rules', icon: BookOpenCheck, tone: 'bg-rose-500/10 text-rose-700' },
  { href: '/admin/scoring', key: 'scoring', icon: SlidersHorizontal, tone: 'bg-blue-500/10 text-blue-700' },
  { href: '/admin/datasets', key: 'datasets', icon: Database, tone: 'bg-emerald-500/10 text-emerald-700' },
];

function active(items: Item[]) {
  return items.filter((item) => item.status === 'active').length;
}

/** Figma-aligned Administrator configuration home backed by current tenant data (DASH-02). */
export default function Page() {
  const t = useTranslations('admin.overview');
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [availability, setAvailability] = useState<Availability>(LOADING_AVAILABILITY);
  const [reportsEnabled, setReportsEnabled] = useState(false);

  const loadSnapshot = useCallback(async () => {
    setAvailability(LOADING_AVAILABILITY);
    const results = await Promise.allSettled([
      personasApi.list(),
      scenariosApi.list(),
      questionsApi.list(),
      rulesApi.list(),
      matricesApi.list(),
      api.GET('/datasets').then((result) => {
        if (!result.data) throw toApiError(result.error);
        return result.data.data as Dataset[];
      }),
      api.GET('/me').then((result) => {
        if (!result.data) throw toApiError(result.error);
        return result.data.data;
      }),
    ] as const);

    const sourceKeys: SourceKey[] = ['personas', 'scenarios', 'questions', 'rules', 'scoring', 'datasets', 'features'];
    setAvailability(Object.fromEntries(sourceKeys.map((key, index) => [key, results[index]?.status === 'fulfilled' ? 'available' : 'unavailable'])) as Availability);
    setSnapshot((current) => ({
      personas: results[0].status === 'fulfilled' ? results[0].value : current.personas,
      scenarios: results[1].status === 'fulfilled' ? results[1].value : current.scenarios,
      questions: results[2].status === 'fulfilled' ? results[2].value : current.questions,
      rules: results[3].status === 'fulfilled' ? results[3].value : current.rules,
      scoring: results[4].status === 'fulfilled' ? results[4].value : current.scoring,
      datasets: results[5].status === 'fulfilled' ? results[5].value : current.datasets,
    }));
    if (results[6].status === 'fulfilled') {
      setReportsEnabled(Boolean(results[6].value.tenant.features.reports));
    } else {
      setReportsEnabled(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const metrics = useMemo(() => {
    const currentQuestions = snapshot.questions.filter((item) => item.status !== 'retired').length;
    const activeScenarios = snapshot.scenarios.filter((item) => item.status === 'active');
    const latestDataset = [...snapshot.datasets].sort((a, b) => b.seq - a.seq)[0];
    return {
      personas: { value: active(snapshot.personas), detail: t('metrics.active', { total: snapshot.personas.length }) },
      scenarios: {
        value: activeScenarios.length,
        detail: t('metrics.personas', { total: new Set(activeScenarios.map((item) => String(item.personaKey ?? ''))).size }),
      },
      questions: { value: snapshot.questions.length, detail: t('metrics.questionsActive', { total: currentQuestions }) },
      rules: { value: active(snapshot.rules), detail: t('metrics.rulesActive') },
      scoring: { value: active(snapshot.scoring), detail: t('metrics.sectorConfigurations') },
      datasets: {
        value: latestDataset ? `v${latestDataset.seq}` : '—',
        detail: latestDataset ? t('metrics.datasetState', { status: latestDataset.status }) : t('metrics.noDataset'),
      },
    } satisfies Record<AreaKey, { value: string | number; detail: string }>;
  }, [snapshot, t]);

  const operations = [
    ...(reportsEnabled
      ? [
          { href: '/admin/analytics', key: 'analytics', icon: BarChart3 },
          { href: '/admin/reports', key: 'reports', icon: FileText },
        ]
      : []),
    { href: '/admin/review', key: 'review', icon: ClipboardCheck },
  ] as const;
  const unavailableSources = Object.values(availability).filter((state) => state === 'unavailable').length;

  return (
    <div className="page-shell">
      <header className="workspace-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="page-heading">{t('title')}</h1>
            <p className="page-description mt-2">{t('description')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{t('roleBadge')}</Badge>
            <Badge variant="secondary">DASH-02</Badge>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('configurationLabel')}>
        {ADMIN_AREAS.map((area) => {
          const Icon = area.icon;
          const metric = metrics[area.key];
          const sourceState = availability[area.key];
          return (
            <Link key={area.href} href={area.href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
              <Card className="h-full min-h-40 transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-[0_16px_38px_rgba(15,35,65,0.08)]">
                <CardHeader className="grid grid-cols-[1fr_auto] gap-4">
                  <div className="min-w-0">
                    <CardDescription>{t(`areas.${area.key}.title`)}</CardDescription>
                    <CardTitle className="metric-value mt-3">{sourceState === 'available' ? metric.value : '—'}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sourceState === 'loading' ? t('metrics.loading') : sourceState === 'unavailable' ? t('metrics.unavailable') : metric.detail}
                    </p>
                  </div>
                  <span className={`grid size-9 place-items-center rounded-lg ${area.tone}`}><Icon className="size-4.5" aria-hidden="true" /></span>
                </CardHeader>
                <CardContent className="mt-auto flex items-end justify-between gap-3 border-t border-border/60 pt-4">
                  <p className="text-xs leading-5 text-muted-foreground">{t(`areas.${area.key}.description`)}</p>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      {unavailableSources > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50/70 p-3.5" role="alert">
          <p className="text-sm leading-5 text-amber-950">{t('partialError', { count: unavailableSources })}</p>
          <Button size="sm" variant="outline" onClick={() => void loadSnapshot()}>{t('retry')}</Button>
        </div>
      ) : null}

      <section className="data-panel" aria-labelledby="admin-operations-title">
        <div className="border-b px-5 py-4">
          <h2 id="admin-operations-title" className="text-sm font-semibold">{t('operations.title')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('operations.description')}</p>
        </div>
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {operations.map((operation) => (
            <Link key={operation.href} href={operation.href} className="group flex min-h-24 items-center gap-3 px-5 py-4 transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary"><operation.icon className="size-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t(`operations.${operation.key}.title`)}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t(`operations.${operation.key}.description`)}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/55 p-3.5 text-xs leading-5 text-blue-950/75">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden="true" />
        {t('configurationNote')}
      </div>
    </div>
  );
}
