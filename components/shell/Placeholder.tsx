import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Temporary page body until the feature lands; names the task and requirement IDs it waits on. */
export function Placeholder({ title, task, requirements }: { title: string; task: string; requirements: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Not built yet — see <code>tasks/backlog.md</code> {task} · {requirements.join(', ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">This screen is a placeholder created in Sprint 0.</CardContent>
    </Card>
  );
}
