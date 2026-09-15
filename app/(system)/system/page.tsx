import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Archive, ArrowUpRight, Building2, DatabaseZap, FileCheck2, KeyRound, ShieldCheck, Users } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SYSTEM_AREAS = [
  { href: '/system/users', key: 'users', icon: Users, tone: 'bg-blue-500/10 text-blue-700' },
  { href: '/system/departments', key: 'departments', icon: Building2, tone: 'bg-violet-500/10 text-violet-700' },
  { href: '/system/tenant', key: 'tenant', icon: KeyRound, tone: 'bg-cyan-500/10 text-cyan-700' },
  { href: '/system/retention', key: 'retention', icon: DatabaseZap, tone: 'bg-amber-500/10 text-amber-700' },
  { href: '/system/audit', key: 'audit', icon: Archive, tone: 'bg-indigo-500/10 text-indigo-700' },
  { href: '/system/dr', key: 'dr', icon: ShieldCheck, tone: 'bg-emerald-500/10 text-emerald-700' },
  { href: '/system/conformance', key: 'conformance', icon: FileCheck2, tone: 'bg-rose-500/10 text-rose-700' },
] as const;

/** System administrator control center. Individual cards lead only to implemented, role-protected routes. */
export default async function Page() {
  const t = await getTranslations('system.overview');
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="relative overflow-hidden rounded-2xl border bg-card px-5 py-7 shadow-sm sm:px-8 sm:py-9">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,var(--color-primary),transparent_64%)] opacity-[0.09]" />
        <div className="relative max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t('eyebrow')}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{t('description')}</p>
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SYSTEM_AREAS.map((area) => (
          <Link key={area.href} href={area.href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full min-h-48 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
              <CardHeader className="h-full">
                <div className="mb-auto flex items-start justify-between">
                  <span className={`grid size-11 place-items-center rounded-xl ${area.tone}`}>
                    <area.icon className="size-5" aria-hidden="true" />
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
                </div>
                <CardTitle className="mt-5 text-base">{t(`areas.${area.key}.title`)}</CardTitle>
                <CardDescription className="leading-5">{t(`areas.${area.key}.description`)}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
