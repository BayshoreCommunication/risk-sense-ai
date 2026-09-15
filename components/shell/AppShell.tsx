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
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  Database,
  FileClock,
  FileSearch,
  Fingerprint,
  History,
  Languages,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquareText,
  Network,
  PanelLeftClose,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
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
type NavItem = { href: string; key: string; icon: LucideIcon; feature?: Feature };

/** Nav entries per role; labels are message keys under `nav.<role>` (messages/*.json). */
const NAV: Record<Role, NavItem[]> = {
  requestor: [
    { href: '/chat', key: 'chat', icon: MessageSquareText },
    { href: '/review', key: 'review', icon: ClipboardCheck },
  ],
  administrator: [
    { href: '/admin', key: 'overview', icon: LayoutDashboard },
    { href: '/admin/review', key: 'review', icon: ClipboardCheck },
    { href: '/admin/personas', key: 'personas', icon: UsersRound },
    { href: '/admin/scenarios', key: 'scenarios', icon: Library },
    { href: '/admin/questions', key: 'questions', icon: BookOpenCheck },
    { href: '/admin/datasets', key: 'datasets', icon: Database },
    { href: '/admin/rules', key: 'rules', icon: Network },
    { href: '/admin/scoring', key: 'scoring', icon: SlidersHorizontal },
    { href: '/admin/analytics', key: 'analytics', icon: BarChart3, feature: 'reports' },
  ],
  system_administrator: [
    { href: '/system', key: 'overview', icon: CircleGauge },
    { href: '/system/users', key: 'users', icon: UserRoundCog },
    { href: '/system/departments', key: 'departments', icon: Building2 },
    { href: '/system/tenant', key: 'tenant', icon: Settings2 },
    { href: '/system/retention', key: 'retention', icon: History },
    { href: '/system/dr', key: 'dr', icon: RefreshCw },
    { href: '/system/conformance', key: 'conformance', icon: ShieldCheck },
    { href: '/system/audit', key: 'audit', icon: Archive },
  ],
  audit: [
    { href: '/audit', key: 'overview', icon: Activity },
    { href: '/audit/assessments', key: 'assessments', icon: FileSearch },
    { href: '/audit/logs', key: 'logs', icon: FileClock },
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
            <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Fingerprint className="size-5" />
            </div>
            <p className="text-sm text-destructive">{loadError ?? t('app.sessionVerifyFailed')}</p>
            <Button onClick={() => void verifySession()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-4 text-sm text-muted-foreground" role="status">
            <div className="relative flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20">
              <Sparkles className="size-6 animate-pulse" />
              <span className="absolute -inset-2 -z-10 animate-ping rounded-3xl bg-primary/10" />
            </div>
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
      <div className="flex h-17 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground shadow-lg shadow-blue-950/25">
          R
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[-0.01em] text-sidebar-foreground">{t('app.name')}</div>
          <div className="truncate text-[0.66rem] font-medium tracking-[0.12em] text-sidebar-foreground/50 uppercase">{t('app.secureWorkspace')}</div>
        </div>
        {mobile && (
          <button
            type="button"
            aria-label={t('app.closeNavigation')}
            className="rounded-lg p-2 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => setMobileNavigationOpen(false)}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-3 px-3 text-[0.65rem] font-semibold tracking-[0.15em] text-sidebar-foreground/55 uppercase">
          {t('app.roleNavigation', { role: t(`roles.${trustedRole}`) })}
        </div>
        <nav className="space-y-1" aria-label={t('app.navigation')}>
          {navigation.map((item) => {
            const active = isNavActive(pathname, item, home);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)]'
                    : 'text-sidebar-foreground/67 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground'
                }`}
              >
                <span className={`flex size-8 items-center justify-center rounded-lg transition ${active ? 'bg-sidebar-primary/18 text-sidebar-primary' : 'text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80'}`}>
                  <Icon className="size-[1.05rem]" />
                </span>
                <span className="min-w-0 flex-1 truncate">{t(`nav.${trustedRole}.${item.key}`)}</span>
                {active && <ChevronRight className="size-3.5 text-sidebar-primary/80" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 space-y-3 border-t border-sidebar-border p-4">
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/45 p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary/18 text-xs font-bold text-sidebar-primary">
              {initials(me.user.name) || 'RS'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-sidebar-foreground">{me.user.name}</div>
              <div className="truncate text-[0.65rem] text-sidebar-foreground/60">{me.user.email}</div>
            </div>
            <Badge className="border-sidebar-border bg-sidebar/40 text-[0.58rem] text-sidebar-foreground" variant="outline">
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-65 border-r border-sidebar-border bg-sidebar lg:block">
        {renderNavigation()}
      </aside>

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

      <div className="min-w-0 lg:pl-65" inert={mobileNavigationOpen ? true : undefined} aria-hidden={mobileNavigationOpen ? true : undefined}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/75 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            ref={mobileNavigationTriggerRef}
            type="button"
            aria-label={t('app.openNavigation')}
            aria-expanded={mobileNavigationOpen}
            aria-controls="app-mobile-navigation"
            className="rounded-xl border bg-card p-2 text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground lg:hidden"
            onClick={() => setMobileNavigationOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PanelLeftClose className="hidden size-4 text-muted-foreground/45 lg:block" aria-hidden="true" />
            <span className="truncate text-sm font-semibold text-foreground">{activeItem ? t(`nav.${trustedRole}.${activeItem.key}`) : t(`roles.${trustedRole}`)}</span>
            <span className="hidden text-muted-foreground/35 sm:inline">/</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{t(`roles.${trustedRole}`)}</span>
          </div>
          <Badge variant={me.tenant.plan === 'paid' ? 'default' : 'secondary'} className="hidden sm:inline-flex">
            {me.tenant.plan.toUpperCase()}
          </Badge>
          <div className="flex size-9 items-center justify-center rounded-xl border bg-card text-xs font-bold text-primary shadow-sm" title={`${me.user.name} · ${me.user.email}`}>
            {initials(me.user.name) || 'RS'}
          </div>
        </header>
        <main className="min-h-[calc(100dvh-4rem)] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
