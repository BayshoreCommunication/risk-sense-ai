'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  BookOpenCheck,
  Building2,
  CircleGauge,
  ClipboardCheck,
  Database,
  FileClock,
  FileSearch,
  FileText,
  Fingerprint,
  History,
  Languages,
  LayoutDashboard,
  Library,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Network,
  PanelLeftClose,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCog,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
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
type NavItem = { href: string; key: string; icon: LucideIcon; feature?: Feature; section?: 'advanced' };

/** Nav entries per role; labels are message keys under `nav.<role>` (messages/*.json). */
const NAV: Record<Role, NavItem[]> = {
  requestor: [
    { href: '/review', key: 'review', icon: ClipboardCheck },
    { href: '/chat', key: 'chat', icon: MessageSquareText },
  ],
  administrator: [
    { href: '/admin', key: 'overview', icon: LayoutDashboard },
    { href: '/admin/personas', key: 'personas', icon: UsersRound },
    { href: '/admin/scenarios', key: 'scenarios', icon: Library },
    { href: '/admin/questions', key: 'questions', icon: BookOpenCheck },
    { href: '/admin/rules', key: 'rules', icon: Network },
    { href: '/admin/scoring', key: 'scoring', icon: SlidersHorizontal },
    { href: '/admin/datasets', key: 'datasets', icon: Database },
    { href: '/admin/analytics', key: 'analytics', icon: BarChart3, feature: 'reports' },
    { href: '/admin/reports', key: 'reports', icon: FileText, feature: 'reports' },
    { href: '/admin/review', key: 'review', icon: ClipboardCheck },
  ],
  system_administrator: [
    { href: '/system', key: 'overview', icon: CircleGauge },
    { href: '/system/users', key: 'users', icon: UserRoundCog },
    { href: '/system/tenant', key: 'tenant', icon: Settings2 },
    { href: '/system/retention', key: 'retention', icon: History },
    { href: '/system/dr', key: 'dr', icon: RefreshCw },
    { href: '/system/departments', key: 'departments', icon: Building2, section: 'advanced' },
    { href: '/system/conformance', key: 'conformance', icon: ShieldCheck, section: 'advanced' },
    { href: '/system/audit', key: 'audit', icon: Archive, section: 'advanced' },
  ],
  audit: [
    { href: '/audit/logs', key: 'logs', icon: FileClock },
    { href: '/audit/assessments', key: 'assessments', icon: FileSearch, section: 'advanced' },
    { href: '/audit', key: 'overview', icon: Activity, section: 'advanced' },
  ],
};

const LOCALES = ['en', 'bn'] as const;
const DRAWER_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function setLocaleCookie(locale: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `rs_locale=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
}

function isNavActive(pathname: string, item: NavItem, home: string) {
  if (item.href === home) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const navigationTrigger = mobileNavigationTriggerRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = mobileNavigationRef.current;
    const focusable = () =>
      drawer
        ? Array.from(drawer.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE)).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
        : [];
    const focusFrame = window.requestAnimationFrame(() => {
      const first = focusable()[0];
      (first ?? drawer)?.focus();
    });
    const handleDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavigationOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        drawer?.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDrawerKeys);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleDrawerKeys);
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
        else navigationTrigger?.focus();
      });
    };
  }, [mobileNavigationOpen]);

  async function logout() {
    await api.DELETE('/auth/session').catch(() => undefined);
    await firebaseSignOut().catch(() => undefined);
    clearSession();
    router.replace('/login');
  }

  if (state !== 'ready' || !me) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
        <div aria-hidden="true" className="subtle-grid absolute inset-0 opacity-60" />
        {state === 'error' ? (
          <div className="surface relative max-w-md space-y-4 p-7 text-center" role="alert">
            <div className="mx-auto flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Fingerprint className="size-5" />
            </div>
            <p className="text-sm text-destructive">{loadError ?? t('app.sessionVerifyFailed')}</p>
            <Button onClick={() => void verifySession()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden="true" />
            <p>{state === 'redirecting' ? t('app.openingWorkspace') : t('app.loading')}</p>
          </div>
        )}
      </div>
    );
  }

  const trustedRole = me.user.role;
  const navigation = NAV[trustedRole].filter((item) => !item.feature || me.tenant.features[item.feature]);
  const home = ROLE_HOME[trustedRole];
  const activeItem = [...navigation].reverse().find((item) => isNavActive(pathname, item, home)) ?? navigation[0];

  const renderNavigation = (mobile = false) => (
    <div className="flex h-full min-h-0 flex-col">
      {mobile ? (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">R</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-[-0.01em] text-sidebar-foreground">{t('app.name')}</div>
            <div className="truncate text-[0.62rem] font-medium tracking-[0.12em] text-sidebar-foreground/50 uppercase">{t('app.secureWorkspace')}</div>
          </div>
          <button
            type="button"
            aria-label={t('app.closeNavigation')}
            className="rounded-lg p-2 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => setMobileNavigationOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-3 px-3 text-[0.62rem] font-semibold tracking-[0.16em] text-sidebar-foreground/45 uppercase">
          {t('app.roleNavigation', { role: t(`roles.${trustedRole}`) })}
        </div>
        <nav className="space-y-0.5" aria-label={t('app.navigation')}>
          {navigation.map((item, index) => {
            const active = isNavActive(pathname, item, home);
            const Icon = item.icon;
            return (
              <div key={item.href}>
                {item.section === 'advanced' && navigation[index - 1]?.section !== 'advanced' ? (
                  <div className="mb-2 mt-5 border-t border-sidebar-border px-3 pt-4 text-[0.59rem] font-semibold tracking-[0.14em] text-sidebar-foreground/40 uppercase">
                    {t('app.advancedOperations')}
                  </div>
                ) : null}
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.84rem] transition ${
                    active
                      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/62 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                  }`}
                >
                  {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary" />}
                  <span className={`flex size-7 items-center justify-center transition ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/38 group-hover:text-sidebar-foreground/80'}`}>
                    <Icon className="size-[1.05rem]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t(`nav.${trustedRole}.${item.key}`)}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 space-y-3 border-t border-sidebar-border p-4">
        <div className="px-1 py-1">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-bold text-sidebar-primary">
              {initials(me.user.name) || 'RS'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-sidebar-foreground">{me.user.name}</div>
              <div className="truncate text-[0.65rem] text-sidebar-foreground/60">{me.user.email}</div>
            </div>
            <Badge className="border-sidebar-border bg-sidebar-accent/70 text-[0.58rem] text-sidebar-foreground" variant="outline">
              {me.tenant.plan.toUpperCase()}
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs text-sidebar-foreground/55">
            <Languages className="mr-1 size-3.5" />
            {LOCALES.map((nextLocale) => (
              <button
                key={nextLocale}
                type="button"
                aria-pressed={locale === nextLocale}
                className={`rounded-md px-2 py-1 transition ${locale === nextLocale ? 'bg-sidebar-accent text-sidebar-foreground' : 'hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
                onClick={() => {
                  setLocaleCookie(nextLocale);
                  window.location.reload();
                }}
              >
                {t(`locale.${nextLocale}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={t('app.signOut')}
            className="rounded-lg p-2 text-sidebar-foreground/55 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => void logout()}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent">
      <div inert={mobileNavigationOpen ? true : undefined} aria-hidden={mobileNavigationOpen ? true : undefined}>
        <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center bg-[#06224b] text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex h-full w-full items-center gap-3 px-4 sm:px-5 lg:w-60 lg:border-r lg:border-white/10">
          <button
            ref={mobileNavigationTriggerRef}
            type="button"
            aria-label={t('app.openNavigation')}
            aria-expanded={mobileNavigationOpen}
            aria-controls="app-mobile-navigation"
            className="rounded-lg p-2 text-white/75 transition hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileNavigationOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#1674df] text-[0.66rem] font-bold text-white shadow-sm">R</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-[-0.01em]">{t('app.name')}</div>
            <div className="hidden truncate text-[0.58rem] font-medium tracking-[0.13em] text-white/52 uppercase sm:block">{t('app.secureWorkspace')}</div>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 items-center gap-2 px-5 lg:flex">
          <PanelLeftClose className="size-4 text-white/36" aria-hidden="true" />
          <span className="truncate text-xs font-medium text-white/72">{activeItem ? t(`nav.${trustedRole}.${activeItem.key}`) : t(`roles.${trustedRole}`)}</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 px-4 sm:px-5">
          <Badge className="hidden border-white/15 bg-white/8 text-[0.62rem] text-white sm:inline-flex" variant="outline">{t(`roles.${trustedRole}`)}</Badge>
          <Badge className="border-white/15 bg-white/8 text-[0.62rem] text-white" variant="outline">{me.tenant.plan.toUpperCase()}</Badge>
          <div className="flex size-8 items-center justify-center rounded-lg border border-white/15 bg-white/8 text-[0.68rem] font-bold text-white" title={`${me.user.name} · ${me.user.email}`}>
            {initials(me.user.name) || 'RS'}
          </div>
        </div>
        </header>

        <aside className="fixed bottom-0 left-0 top-14 z-40 hidden w-60 border-r border-sidebar-border bg-sidebar lg:block">
          {renderNavigation()}
        </aside>
      </div>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setMobileNavigationOpen(false)}
          />
          <aside
            ref={mobileNavigationRef}
            id="app-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={t('app.navigation')}
            tabIndex={-1}
            className="relative h-full w-[min(20rem,88vw)] border-r border-sidebar-border bg-sidebar shadow-2xl outline-none"
          >
            {renderNavigation(true)}
          </aside>
        </div>
      )}

      <div className="min-w-0 pt-14 lg:pl-60" inert={mobileNavigationOpen ? true : undefined} aria-hidden={mobileNavigationOpen ? true : undefined}>
        <main className="min-h-[calc(100dvh-3.5rem)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
