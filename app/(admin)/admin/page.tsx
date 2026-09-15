import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ADMIN_AREAS = [
  {
    href: '/admin/review',
    key: 'review',
  },
  {
    href: '/admin/personas',
    key: 'personas',
  },
  {
    href: '/admin/scenarios',
    key: 'scenarios',
  },
  {
    href: '/admin/questions',
    key: 'questions',
  },
  {
    href: '/admin/datasets',
    key: 'datasets',
  },
  {
    href: '/admin/rules',
    key: 'rules',
  },
  {
    href: '/admin/scoring',
    key: 'scoring',
  },
] as const;

/** Working administrator landing page using only implemented dashboard routes (DASH-02). */
export default async function Page() {
  const t = await getTranslations('admin.overview');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ADMIN_AREAS.map((area) => (
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
