'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { firebaseSignOut } from '@/lib/firebase/client';
import { clearSession, type Role } from '@/lib/session';

type Me = { user: { name: string; email: string; role: Role }; tenant: { slug: string; plan: 'free' | 'paid' } };

/** Nav entries per role; labels are message keys under `nav.<role>` (messages/*.json). */
const NAV: Record<Role, { href: string; key: string }[]> = {
  requestor: [
    { href: '/chat', key: 'chat' },
    { href: '/review', key: 'review' },
  ],
  administrator: [
    { href: '/admin', key: 'overview' },
    { href: '/admin/review', key: 'review' },
    { href: '/admin/personas', key: 'personas' },
    { href: '/admin/scenarios', key: 'scenarios' },
    { href: '/admin/questions', key: 'questions' },
    { href: '/admin/datasets', key: 'datasets' },
    { href: '/admin/rules', key: 'rules' },
    { href: '/admin/scoring', key: 'scoring' },
    { href: '/admin/analytics', key: 'analytics' },
  ],
  system_administrator: [
    { href: '/system', key: 'overview' },
    { href: '/system/users', key: 'users' },
    { href: '/system/departments', key: 'departments' },
    { href: '/system/tenant', key: 'tenant' },
    { href: '/system/retention', key: 'retention' },
    { href: '/system/dr', key: 'dr' },
  ],
  audit: [
    { href: '/audit', key: 'overview' },
    { href: '/audit/assessments', key: 'assessments' },
    { href: '/audit/logs', key: 'logs' },
  ],
};

const LOCALES = ['en', 'bn'] as const;
function setLocaleCookie(locale: string) {
  document.cookie = `rs_locale=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

/**
 * Role-scoped shell: sidebar links come from the role returned by GET /me, never from the URL.
 * A user has exactly one role (FR-02), so there is no role switcher here in production.
 */
export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api.GET('/me').then((res) => {
      if (res.error || !res.data) {
        clearSession();
        router.replace('/login');
        return;
      }
      setMe(res.data.data as Me);
    });
  }, [router]);

  async function logout() {
    await api.DELETE('/auth/session').catch(() => undefined);
    await firebaseSignOut().catch(() => undefined);
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-muted/20 p-4">
        <div className="mb-6">
          <div className="text-lg font-semibold">{t('app.name')}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t(`roles.${role}`)}</Badge>
            {me && <Badge variant={me.tenant.plan === 'paid' ? 'default' : 'secondary'}>{me.tenant.plan.toUpperCase()}</Badge>}
          </div>
        </div>
        <nav className="space-y-1">
          {NAV[role].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname === item.href ? 'bg-muted font-medium' : ''}`}
            >
              {t(`nav.${role}.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="mt-6 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{t('locale.label')}:</span>
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              className={`rounded px-1.5 py-0.5 ${locale === l ? 'bg-muted font-medium text-foreground' : 'hover:bg-muted'}`}
              onClick={() => {
                setLocaleCookie(l);
                router.refresh();
              }}
            >
              {t(`locale.${l}`)}
            </button>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-sm text-muted-foreground">{me ? `${me.user.name} · ${me.user.email}` : t('app.loading')}</div>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            {t('app.signOut')}
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
