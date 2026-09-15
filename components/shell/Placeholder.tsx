import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

/** Temporary page body until the feature lands; names the task and requirement IDs it waits on. */
export function Placeholder({ title, task, requirements }: { title: string; task: string; requirements: string[] }) {
  const t = useTranslations('placeholder');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {t('notBuilt')} <code>tasks/backlog.md</code> {task} · {requirements.join(', ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{t('description')}</CardContent>
    </Card>
  );
}
