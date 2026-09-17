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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';
import { firebaseSignOut } from '@/lib/firebase/client';
import { WorkspaceProvider } from '@/components/shell/workspace-context';
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

/** Avatar letter: the first character of the account name. */
function avatarLetter(name: string) {
  return name.trim().charAt(0).toUpperCase();
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
  const [collapsed, setCollapsed] = useState(false);
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

  // Remember the rail state per browser; storage can throw or be empty, so the default stands.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
    } catch {
      /* private mode or blocked storage: keep the expanded default */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      /* nothing to do: the rail still works for this page view */
    }
  }, [collapsed]);

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

  const renderNavigation = (mobile = false) => {
    // The rail collapses to icons only on large screens; the mobile drawer always shows labels.
    const compact = collapsed && !mobile;
    return (
    <div className="flex h-full min-h-0 flex-col">
      {mobile ? (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">R</div>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em] text-sidebar-foreground">{t('app.name')}</div>
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

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-2.5">
        <nav className="space-y-0.5" aria-label={t('app.navigation')}>
          {navigation.map((item, index) => {
            const active = isNavActive(pathname, item, home);
            const Icon = item.icon;
            const label = t(`nav.${trustedRole}.${item.key}`);
            const startsAdvanced = item.section === 'advanced' && navigation[index - 1]?.section !== 'advanced';
            return (
              <div key={item.href}>
                {startsAdvanced ? (
                  compact ? (
                    <div className="my-3 border-t border-sidebar-border" aria-hidden="true" />
                  ) : (
                    <div className="mb-2 mt-5 border-t border-sidebar-border px-3 pt-4 text-[0.59rem] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                      {t('app.advancedOperations')}
                    </div>
                  )
                ) : null}
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={compact ? label : undefined}
                  className={`group relative flex items-center rounded-md text-sm transition ${compact ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2'} ${
                    active
                      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                  }`}
                >
                  {active && <span aria-hidden="true" className="absolute inset-y-1.5 -left-1 w-[3px] rounded-full bg-sidebar-primary" />}
                  <span className={`flex size-6 shrink-0 items-center justify-center transition ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'}`}>
                    <Icon className="size-4" />
                  </span>
                  {compact ? <span className="sr-only">{label}</span> : <span className="min-w-0 flex-1 truncate">{label}</span>}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      <div className={`shrink-0 border-t border-sidebar-border ${compact ? 'space-y-1.5 p-2' : 'space-y-1.5 p-2'}`}>
        {compact ? (
          <div
            className="mx-auto flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-primary"
            title={`${me.user.name} · ${me.user.email} · ${me.tenant.plan.toUpperCase()}`}
          >
            {avatarLetter(me.user.name) || 'R'}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-primary">
              {avatarLetter(me.user.name) || 'R'}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[0.8rem] font-semibold text-sidebar-foreground">{me.user.name}</div>
              <div className="truncate text-[0.68rem] text-sidebar-foreground/65">{me.user.email}</div>
            </div>
            <Badge className="border-sidebar-border bg-sidebar-accent/70 text-[0.55rem] text-sidebar-foreground" variant="outline">
              {me.tenant.plan.toUpperCase()}
            </Badge>
          </div>
        )}
        <button
          type="button"
          aria-label={t('app.signOut')}
          title={compact ? t('app.signOut') : undefined}
          className={`flex w-full items-center rounded-md border border-destructive/15 bg-destructive/6 text-[0.82rem] font-medium text-destructive/90 transition hover:border-destructive/30 hover:bg-destructive/12 hover:text-destructive ${compact ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'}`}
          onClick={() => void logout()}
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          {compact ? null : <span>{t('app.signOut')}</span>}
        </button>
      </div>
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div inert={mobileNavigationOpen ? true : undefined} aria-hidden={mobileNavigationOpen ? true : undefined}>
        <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center bg-[#06224b] text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className={`flex h-full w-full items-center gap-3 px-4 sm:px-5 lg:border-r lg:border-white/10 ${collapsed ? 'lg:w-[4.5rem] lg:justify-center lg:px-0' : 'lg:w-64'}`}>
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
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#1674df] text-[0.72rem] font-bold text-white shadow-sm">R</div>
          {collapsed ? null : (
            <div className="min-w-0">
              <div className="truncate text-[0.95rem] font-semibold tracking-[-0.01em]">{t('app.name')}</div>
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 px-4 sm:px-5">
          {/* Identity pill: the account's avatar letter beside the verified role. */}
          <div
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[0.78rem] font-medium text-white"
            title={`${me.user.name} · ${me.user.email} · ${me.tenant.plan.toUpperCase()}`}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/15 text-[0.7rem] font-semibold">{avatarLetter(me.user.name) || 'R'}</span>
            <span className="truncate">{t(`roles.${trustedRole}`)}</span>
          </div>
        </div>
        </header>

        <aside className={`fixed bottom-0 left-0 top-14 z-40 sidebar-surface hidden border-r border-sidebar-border transition-[width] lg:block ${collapsed ? 'w-[4.5rem]' : 'w-64'}`}>
          {renderNavigation()}
        </aside>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              aria-label={collapsed ? t('app.expandNavigation') : t('app.collapseNavigation')}
              aria-expanded={!collapsed}
              className={`fixed top-14 z-50 hidden size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/70 shadow-[0_1px_3px_rgba(15,35,65,0.2)] transition hover:border-sidebar-primary/40 hover:bg-sidebar-accent hover:text-sidebar-primary lg:grid ${collapsed ? 'left-[4.5rem]' : 'left-64'}`}
              onClick={() => setCollapsed((current) => !current)}
            >
              {collapsed ? <ChevronRight className="size-3.5" aria-hidden="true" /> : <ChevronLeft className="size-3.5" aria-hidden="true" />}
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? t('app.expandNavigation') : t('app.collapseNavigation')}</TooltipContent>
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

      <div className={`min-w-0 pt-14 ${collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64'}`} inert={mobileNavigationOpen ? true : undefined} aria-hidden={mobileNavigationOpen ? true : undefined}>
        <main className="scrollbar-subtle h-[calc(100dvh-3.5rem)] overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <WorkspaceProvider value={{ role: trustedRole, plan: me.tenant.plan }}>{children}</WorkspaceProvider>
        </main>
      </div>
    </div>
  );
}
