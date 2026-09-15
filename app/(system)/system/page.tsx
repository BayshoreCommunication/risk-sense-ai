import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SYSTEM_AREAS = [
  { href: '/system/users', key: 'users' },
  { href: '/system/departments', key: 'departments' },
  { href: '/system/tenant', key: 'tenant' },
  { href: '/system/retention', key: 'retention' },
  { href: '/system/dr', key: 'dr' },
  { href: '/system/conformance', key: 'conformance' },
] as const;

/** System administrator control center. Individual cards lead only to implemented, role-protected routes. */
export default async function Page() {
  const t = await getTranslations('system.overview');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SYSTEM_AREAS.map((area) => (
          <Link key={area.href} href={area.href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-muted/30">
              <CardHeader>
                <CardTitle>{t(`areas.${area.key}.title`)}</CardTitle>
                <CardDescription>{t(`areas.${area.key}.description`)}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
