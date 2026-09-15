'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  Database,
  GitBranch,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api/client';

type Area = {
  href: string;
  key: 'review' | 'personas' | 'scenarios' | 'questions' | 'datasets' | 'rules' | 'scoring';
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
};

const ADMIN_AREAS: Area[] = [
  { href: '/admin/review', key: 'review', icon: ClipboardCheck, iconClass: 'bg-amber-500/10 text-amber-700' },
  { href: '/admin/personas', key: 'personas', icon: BrainCircuit, iconClass: 'bg-violet-500/10 text-violet-700' },
  { href: '/admin/scenarios', key: 'scenarios', icon: GitBranch, iconClass: 'bg-sky-500/10 text-sky-700' },
  { href: '/admin/questions', key: 'questions', icon: ListChecks, iconClass: 'bg-cyan-500/10 text-cyan-700' },
  { href: '/admin/datasets', key: 'datasets', icon: Database, iconClass: 'bg-emerald-500/10 text-emerald-700' },
  { href: '/admin/rules', key: 'rules', icon: BookOpenCheck, iconClass: 'bg-rose-500/10 text-rose-700' },
  { href: '/admin/scoring', key: 'scoring', icon: SlidersHorizontal, iconClass: 'bg-blue-500/10 text-blue-700' },
];

/** Working administrator landing page using only implemented dashboard routes (DASH-02). */
export default function Page() {
  const t = useTranslations('admin.overview');
  const analytics = useTranslations('admin.analytics');
  const [reportsEnabled, setReportsEnabled] = useState(false);

  useEffect(() => {
    void api.GET('/me').then((response) => {
      const me = response.data?.data as { tenant?: { features?: { reports?: boolean } } } | undefined;
      setReportsEnabled(Boolean(me?.tenant?.features?.reports));
    });
  }, []);

  return (
    <div className="space-y-5">
      <header className="workspace-header">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t('description')}</p>
      </header>

      <section className="data-panel grid sm:grid-cols-2 xl:grid-cols-3">
        {ADMIN_AREAS.map((area) => {
          const Icon = area.icon;
          return (
            <Link key={area.href} href={area.href} className="group border-b border-r border-border/70 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <Card className="h-full min-h-40 rounded-none border-0 bg-transparent shadow-none transition-colors group-hover:bg-accent/30">
                <CardHeader className="h-full gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <span className={`grid size-9 place-items-center rounded-lg ${area.iconClass}`}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t(`areas.${area.key}.title`)}</CardTitle>
                    <CardDescription className="mt-1.5 leading-5">{t(`areas.${area.key}.description`)}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}

        {reportsEnabled ? (
          <Link href="/admin/analytics" className="group border-b border-r border-border/70 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <Card className="h-full min-h-40 rounded-none border-0 bg-transparent shadow-none transition-colors group-hover:bg-accent/30">
              <CardHeader className="h-full gap-5">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-9 place-items-center rounded-lg bg-indigo-500/10 text-indigo-700">
                    <BarChart3 className="size-5" aria-hidden="true" />
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-base">{analytics('title')}</CardTitle>
                  <CardDescription className="mt-1.5 leading-5">{analytics('description')}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ) : null}
      </section>
    </div>
  );
}
