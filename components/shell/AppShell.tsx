'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { firebaseSignOut } from '@/lib/firebase/client';
import { clearSession, type Role } from '@/lib/session';

type Me = { user: { name: string; email: string; role: Role }; tenant: { slug: string; plan: 'free' | 'paid' } };

const NAV: Record<Role, { href: string; label: string }[]> = {
  requestor: [
    { href: '/chat', label: 'New assessment' },
    { href: '/review', label: 'Review' },
  ],
  administrator: [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/personas', label: 'Personas' },
    { href: '/admin/scenarios', label: 'Scenarios' },
    { href: '/admin/questions', label: 'Questions' },
    { href: '/admin/datasets', label: 'Datasets' },
    { href: '/admin/rules', label: 'Rules' },
    { href: '/admin/scoring', label: 'Scoring' },
    { href: '/admin/analytics', label: 'Analytics' },
  ],
  system_administrator: [
    { href: '/system', label: 'Overview' },
    { href: '/system/users', label: 'Users' },
    { href: '/system/departments', label: 'Departments' },
    { href: '/system/tenant', label: 'Tenant' },
    { href: '/system/retention', label: 'Retention' },
    { href: '/system/dr', label: 'DR' },
  ],
  audit: [
    { href: '/audit', label: 'Overview' },
    { href: '/audit/assessments', label: 'Assessments' },
    { href: '/audit/logs', label: 'Audit logs' },
  ],
};

/**
 * Role-scoped shell: sidebar links come from the role returned by GET /me, never from the URL.
 * A user has exactly one role (FR-02), so there is no role switcher here in production.
 */
export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
          <div className="text-lg font-semibold">RiskSense AI</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{role.replace('_', ' ')}</Badge>
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
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-sm text-muted-foreground">{me ? `${me.user.name} · ${me.user.email}` : 'Loading…'}</div>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
