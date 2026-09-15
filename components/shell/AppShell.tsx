'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';
import { firebaseSignOut } from '@/lib/firebase/client';
import { clearSession, ROLE_HOME, storeRole, type Role } from '@/lib/session';

type AuthUser = components['schemas']['AuthUser'];
type AuthTenant = components['schemas']['AuthTenant'];
type Me = { user: AuthUser; tenant: AuthTenant; sessionId: string };
type Feature = keyof AuthTenant['features'];
type NavItem = { href: string; key: string; feature?: Feature };

/** Nav entries per role; labels are message keys under `nav.<role>` (messages/*.json). */
const NAV: Record<Role, NavItem[]> = {
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
    { href: '/admin/analytics', key: 'analytics', feature: 'reports' },
  ],
  system_administrator: [
    { href: '/system', key: 'overview' },
    { href: '/system/users', key: 'users' },
    { href: '/system/departments', key: 'departments' },
    { href: '/system/tenant', key: 'tenant' },
    { href: '/system/retention', key: 'retention' },
    { href: '/system/dr', key: 'dr' },
    { href: '/system/conformance', key: 'conformance' },
  ],
  audit: [
    { href: '/audit', key: 'overview' },
    { href: '/audit/assessments', key: 'assessments' },
    { href: '/audit/logs', key: 'logs' },
  ],
};

const LOCALES = ['en', 'bn'] as const;
function setLocaleCookie(locale: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `rs_locale=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
}

/**
 * Role-scoped shell. The cookie and route-group role are routing hints only: protected content and
 * navigation are withheld until GET /me verifies the backend-authoritative role and feature map.
 */
export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const verifySession = useCallback(async () => {
    setState('loading');
    setLoadError(null);

    try {
      const res = await api.GET('/me');
      if (!res.data) throw new Error(t('app.sessionVerifyFailed'));

      const trustedMe = res.data.data;
      const trustedRole = trustedMe.user.role;
      storeRole(trustedRole);

      if (trustedRole !== role) {
        setState('redirecting');
        router.replace(ROLE_HOME[trustedRole]);
        return;
      }

      setMe(trustedMe);
      setState('ready');
    } catch (error) {
      setLoadError(toApiError(error).message);
      setState('error');
    }
  }, [role, router, t]);

  useEffect(() => {
    void verifySession();
  }, [verifySession]);

  async function logout() {
    await api.DELETE('/auth/session').catch(() => undefined);
    await firebaseSignOut().catch(() => undefined);
    clearSession();
    router.replace('/login');
  }

  if (state !== 'ready' || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        {state === 'error' ? (
          <div className="max-w-md space-y-3 text-center" role="alert">
            <p className="text-sm text-destructive">{loadError ?? t('app.sessionVerifyFailed')}</p>
            <Button variant="outline" onClick={() => void verifySession()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{state === 'redirecting' ? t('app.openingWorkspace') : t('app.loading')}</p>
        )}
      </div>
    );
  }

  const trustedRole = me.user.role;
  const navigation = NAV[trustedRole].filter((item) => !item.feature || me.tenant.features[item.feature]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-muted/20 p-4">
        <div className="mb-6">
          <div className="text-lg font-semibold">{t('app.name')}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{t(`roles.${trustedRole}`)}</Badge>
            <Badge variant={me.tenant.plan === 'paid' ? 'default' : 'secondary'}>{me.tenant.plan.toUpperCase()}</Badge>
          </div>
        </div>
        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm hover:bg-muted ${pathname === item.href ? 'bg-muted font-medium' : ''}`}
            >
              {t(`nav.${trustedRole}.${item.key}`)}
            </Link>
          ))}
        </nav>
        <div className="mt-6 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{t('locale.label')}:</span>
          {LOCALES.map((nextLocale) => (
            <button
              key={nextLocale}
              type="button"
              className={`rounded px-1.5 py-0.5 ${locale === nextLocale ? 'bg-muted font-medium text-foreground' : 'hover:bg-muted'}`}
              onClick={() => {
                setLocaleCookie(nextLocale);
                window.location.reload();
              }}
            >
              {t(`locale.${nextLocale}`)}
            </button>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-sm text-muted-foreground">{`${me.user.name} · ${me.user.email}`}</div>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            {t('app.signOut')}
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
