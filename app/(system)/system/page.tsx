import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Archive, ArrowUpRight, Building2, DatabaseZap, FileCheck2, KeyRound, ShieldCheck, Users } from 'lucide-react';

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
    <div className="page-shell">
      <header className="workspace-header">
        <div className="max-w-3xl">
          <h1 className="page-heading">{t('title')}</h1>
          <p className="page-description mt-2">{t('description')}</p>
        </div>
      </header>
      <div className="data-panel divide-y">
        {SYSTEM_AREAS.map((area) => (
          <Link key={area.href} href={area.href} className="group grid min-h-24 grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
            <span className={`grid size-10 place-items-center rounded-lg ${area.tone}`}>
              <area.icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t(`areas.${area.key}.title`)}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(`areas.${area.key}.description`)}</span>
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
