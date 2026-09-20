'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  Database,
  GitBranch,
  Info,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shell/PageHeader';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';
import { matricesApi, personasApi, questionsApi, rulesApi, scenariosApi, type Item } from '@/lib/admin/content';
import { formatIdentifierLabel } from '@/lib/format-identifier-label';

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
  { href: '/admin/personas', key: 'personas', icon: BrainCircuit, tone: 'bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300' },
  { href: '/admin/scenarios', key: 'scenarios', icon: GitBranch, tone: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' },
  { href: '/admin/questions', key: 'questions', icon: ListChecks, tone: 'bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300' },
  { href: '/admin/rules', key: 'rules', icon: BookOpenCheck, tone: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300' },
  { href: '/admin/scoring', key: 'scoring', icon: SlidersHorizontal, tone: 'bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300' },
  { href: '/admin/datasets', key: 'datasets', icon: Database, tone: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' },
];

function active(items: Item[]) {
  return items.filter((item) => item.status === 'active').length;
}

/** Figma-aligned Administrator configuration home backed by current tenant data (DASH-02). */
export default function Page() {
  const t = useTranslations('admin.overview');
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [availability, setAvailability] = useState<Availability>(LOADING_AVAILABILITY);

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
        detail: latestDataset ? t('metrics.datasetState', { status: formatIdentifierLabel(latestDataset.status) }) : t('metrics.noDataset'),
      },
    } satisfies Record<AreaKey, { value: string | number; detail: string }>;
  }, [snapshot, t]);

  const unavailableSources = Object.values(availability).filter((state) => state === 'unavailable').length;

  return (
    <div className="page-shell">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['DASH-02']}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('configurationLabel')}>
        {ADMIN_AREAS.map((area) => {
          const Icon = area.icon;
          const metric = metrics[area.key];
          const sourceState = availability[area.key];
          return (
            <Link key={area.href} href={area.href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
              <Card className="h-full min-h-[13rem] overflow-hidden transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-[0_18px_44px_rgba(15,35,65,0.1)]">
                <CardHeader className="relative flex h-full flex-row items-start gap-5 p-7">
                  <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${area.tone}`}><Icon className="size-7" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <CardDescription className="text-sm font-semibold text-foreground">{t(`areas.${area.key}.title`)}</CardDescription>
                    <CardTitle className="mt-4 text-[2.25rem] leading-none tracking-[-0.045em]">{sourceState === 'available' ? metric.value : '—'}</CardTitle>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {sourceState === 'loading' ? t('metrics.loading') : sourceState === 'unavailable' ? t('metrics.unavailable') : metric.detail}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/45 transition group-hover:text-primary" aria-hidden="true" />
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </section>

      {unavailableSources > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50/70 p-3.5 dark:border-amber-400/30 dark:bg-amber-400/10" role="alert">
          <p className="text-sm leading-5 text-amber-950 dark:text-amber-100">{t('partialError', { count: unavailableSources })}</p>
          <Button size="sm" variant="outline" onClick={() => void loadSnapshot()}>{t('retry')}</Button>
        </div>
      ) : null}
      <p className="flex max-w-2xl items-start gap-3 text-sm leading-6 text-muted-foreground">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Info className="size-3.5" aria-hidden="true" /></span>
        {t('accessNote')}
      </p>
    </div>
  );
}
