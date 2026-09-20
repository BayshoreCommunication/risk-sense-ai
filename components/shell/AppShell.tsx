'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  BookOpenCheck,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileClock,
  FileSearch,
  FileText,
  Fingerprint,
  History,
  LayoutDashboard,
  Library,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Network,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCog,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';
import { firebaseSignOut } from '@/lib/firebase/client';
import { WorkspaceProvider } from '@/components/shell/workspace-context';
import { LanguageSwitcher } from '@/components/shell/LanguageSwitcher';
import { ThemeSwitcher } from '@/components/theme/ThemeSwitcher';
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
  ],
};

const SIDEBAR_STORAGE_KEY = 'rs_sidebar_collapsed';
const DRAWER_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';


function isNavActive(pathname: string, item: NavItem, home: string) {
  if (item.href === home) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Compact account identity used by the Figma header pill (for example, “M Opsi” → “MO”). */
function accountInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'R';
}

/**
 * Role-scoped shell. The cookie and route-group role are routing hints only: protected content and
 * navigation are withheld until GET /me verifies the backend-authoritative role and feature map.
 */
export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean | null>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);

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
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  useEffect(() => {
    if (sidebarCollapsed === null) return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      /* Blocked storage does not prevent the sidebar from working for this page view. */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closeAccountMenuOutside = (event: PointerEvent) => {
      const accountMenu = accountMenuRef.current;
      if (!accountMenu?.open || event.composedPath().includes(accountMenu)) return;
      accountMenu.open = false;
    };

    document.addEventListener('pointerdown', closeAccountMenuOutside, true);
    return () => document.removeEventListener('pointerdown', closeAccountMenuOutside, true);
  }, []);

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
  const desktopNavigationCollapsed = sidebarCollapsed === true;
  const isConversationWorkspace = /^\/chat\/[^/]+$/.test(pathname);

  const renderNavigation = (mobile = false) => {
    const compact = desktopNavigationCollapsed && !mobile;
    return (
      <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col">
        {mobile ? (
          <div className="flex h-[4.75rem] shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">R</div>
            <div className="min-w-0 flex-1 truncate text-base font-semibold tracking-[-0.01em] text-sidebar-foreground">{t('app.name')}</div>
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

        <div className={`scrollbar-subtle min-h-0 flex-1 overflow-y-auto pb-6 pt-7 ${compact ? 'px-2' : 'px-4'}`}>
          <p className={`${compact ? 'sr-only' : 'mb-4 px-3'} text-[0.72rem] font-semibold tracking-[0.05em] text-sidebar-foreground/65 uppercase`}>
            {t(`roles.${trustedRole}`)}
          </p>
          <nav className="space-y-1" aria-label={t('app.navigation')}>
            {navigation.map((item, index) => {
              const active = isNavActive(pathname, item, home);
              const Icon = item.icon;
              const label = t(`nav.${trustedRole}.${item.key}`);
              const startsAdvanced = item.section === 'advanced' && navigation[index - 1]?.section !== 'advanced';
              const navigationLink = (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center rounded-lg py-3 text-[0.9rem] transition ${compact ? 'justify-center px-2' : 'gap-3 px-3'} ${
                    active
                      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                  }`}
                >
                  {active && <span aria-hidden="true" className="absolute inset-y-2 -left-2 w-[3px] rounded-full bg-sidebar-primary" />}
                  <span className={`flex size-6 shrink-0 items-center justify-center transition ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'}`}>
                    <Icon className="size-[1.15rem]" />
                  </span>
                  <span className={compact ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
                </Link>
              );
              return (
                <div key={item.href}>
                  {startsAdvanced ? compact ? (
                    <div className="my-4 border-t border-sidebar-border" aria-hidden="true" />
                  ) : (
                    <div className="mb-2 mt-6 border-t border-sidebar-border px-3 pt-4 text-[0.61rem] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                      {t('app.advancedOperations')}
                    </div>
                  ) : null}
                  {compact ? (
                    <Tooltip>
                      <TooltipTrigger render={navigationLink} />
                      <TooltipContent role="tooltip" side="right">{label}</TooltipContent>
                    </Tooltip>
                  ) : navigationLink}
                </div>
              );
            })}
          </nav>
        </div>
        {mobile ? (
          <div className="shrink-0 border-t border-sidebar-border p-4">
            <div className="mb-3 min-w-0 px-2">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{me.user.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{me.user.email}</p>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              onClick={() => void logout()}
            >
              <LogOut aria-hidden="true" className="size-4" />
              {t('app.signOut')}
            </button>
          </div>
        ) : null}
      </div>
      </TooltipProvider>
    );
  };

  return (
    <div className="min-h-screen bg-transparent">
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-white px-4 py-2 text-sm font-semibold text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t('app.skipToContent')}
      </a>
      <div inert={mobileNavigationOpen ? true : undefined} aria-hidden={mobileNavigationOpen ? true : undefined}>
        <header className="fixed inset-x-0 top-0 z-50 flex h-[4.75rem] items-center bg-[#061d43] text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className={`flex h-full min-w-0 flex-1 items-center gap-3 px-4 transition-[width,padding] duration-200 motion-reduce:transition-none sm:px-6 lg:flex-none ${desktopNavigationCollapsed ? 'lg:w-[4.5rem] lg:justify-center lg:px-0' : 'lg:w-64 lg:px-7'}`}>
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
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#216cff] text-sm font-bold text-white shadow-[0_6px_18px_rgba(33,108,255,0.35)]">R</div>
          <div className={`min-w-0 truncate text-lg font-semibold tracking-[-0.02em] ${desktopNavigationCollapsed ? 'lg:hidden' : ''}`}>{t('app.name')}</div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 pr-4 sm:px-7">
          <details ref={accountMenuRef} className="group relative" data-testid="account-menu">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-white/25 bg-white/[0.04] px-3 py-2 text-[0.82rem] font-semibold text-white outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 sm:px-4 [&::-webkit-details-marker]:hidden">
              <span className="sm:hidden">{accountInitials(me.user.name)}</span>
              <span className="hidden truncate sm:inline">{accountInitials(me.user.name)} · {t(`roles.${trustedRole}`)}</span>
              <ChevronDown aria-hidden="true" className="hidden size-4 text-white/70 transition group-open:rotate-180 sm:block" />
            </summary>
            <div className="absolute right-0 mt-2 max-h-[calc(100dvh-6rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-card text-card-foreground shadow-[0_20px_55px_rgba(6,29,67,0.22)]">
              <div className="border-b p-4">
                <p className="truncate text-sm font-semibold">{me.user.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{me.user.email}</p>
                <p className="mt-2 text-[0.65rem] font-semibold tracking-[0.12em] text-primary uppercase">{me.tenant.plan} · {t(`roles.${trustedRole}`)}</p>
              </div>
              <div className="border-b p-3">
                <LanguageSwitcher className="justify-between" />
              </div>
              <div className="border-b p-3">
                <ThemeSwitcher />
              </div>
              <button type="button" className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium transition hover:bg-muted" onClick={() => void logout()}>
                <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
                {t('app.signOut')}
              </button>
            </div>
          </details>
        </div>
        </header>

        <aside
          id="app-desktop-navigation"
          aria-label={t('app.navigation')}
          className={`sidebar-surface fixed bottom-0 left-0 top-[4.75rem] z-40 hidden border-r border-sidebar-border transition-[width] duration-200 motion-reduce:transition-none lg:block ${desktopNavigationCollapsed ? 'w-[4.5rem]' : 'w-64'}`}
        >
          {renderNavigation()}
        </aside>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={desktopNavigationCollapsed ? t('app.expandNavigation') : t('app.collapseNavigation')}
              aria-controls="app-desktop-navigation"
              aria-expanded={!desktopNavigationCollapsed}
              className={`fixed top-[4.75rem] z-50 hidden size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#061d43] text-white/80 shadow-[0_2px_8px_rgba(6,29,67,0.28)] transition-[left,background-color,color,border-color] duration-200 motion-reduce:transition-none hover:border-white/35 hover:bg-[#0b2c5c] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8bb9ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#061d43] lg:grid ${desktopNavigationCollapsed ? 'left-[4.5rem]' : 'left-64'}`}
              onClick={() => setSidebarCollapsed((current) => !(current ?? false))}
            >
              {desktopNavigationCollapsed ? <ChevronRight className="size-3.5" aria-hidden="true" /> : <ChevronLeft className="size-3.5" aria-hidden="true" />}
            </TooltipTrigger>
            <TooltipContent side="right">{desktopNavigationCollapsed ? t('app.expandNavigation') : t('app.collapseNavigation')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
            className="sidebar-surface relative h-full w-[min(20rem,88vw)] border-r border-sidebar-border shadow-2xl outline-none"
          >
            {renderNavigation(true)}
          </aside>
        </div>
      )}

      <div className={`min-w-0 pt-[4.75rem] transition-[padding] duration-200 motion-reduce:transition-none ${desktopNavigationCollapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64'}`} inert={mobileNavigationOpen ? true : undefined} aria-hidden={mobileNavigationOpen ? true : undefined}>
        <main
          id="main-content"
          tabIndex={-1}
          className={`h-[calc(100dvh-4.75rem)] overflow-hidden outline-none ${
            isConversationWorkspace ? 'px-3 py-2 sm:px-5 sm:py-2.5 lg:px-7 lg:py-3' : 'px-4 py-5 sm:px-7 sm:py-7 lg:px-12 lg:py-10'
          }`}
        >
          <WorkspaceProvider value={{ role: trustedRole, plan: me.tenant.plan, features: me.tenant.features, sectors: me.tenant.sectors ?? [] }}>{children}</WorkspaceProvider>
        </main>
      </div>
    </div>
  );
}
