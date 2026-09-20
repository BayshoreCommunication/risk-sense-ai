'use client';

import { useLocale, useTranslations } from 'next-intl';
import { BookmarkCheck, CircleCheck, Clock, FileQuestion } from 'lucide-react';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { Badge } from '@/components/ui/badge';
import { questionsApi, type Item } from '@/lib/admin/content';
import { useWorkspace } from '@/components/shell/workspace-context';

const SUMMARY_TONE = [
  { icon: FileQuestion, tile: 'bg-blue-500/10 text-blue-700' },
  { icon: CircleCheck, tile: 'bg-emerald-500/10 text-emerald-700' },
  { icon: Clock, tile: 'bg-amber-500/10 text-amber-700' },
  { icon: BookmarkCheck, tile: 'bg-violet-500/10 text-violet-700' },
] as const;

function tagsOf(item: Item) {
  return (item.tags ?? {}) as { personaKeys?: string[]; scenarioKeys?: string[]; sectors?: string[] };
}

function questionFields(t: ReturnType<typeof useTranslations>, sectors: string[]): FieldSpec[] {
  return [
  { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
  { name: 'text', label: t('fields.questionText'), kind: 'textarea', required: true },
  { name: 'type', label: t('fields.type'), kind: 'select', options: ['yes_no', 'mcq', 'number', 'free_text'], required: true },
  {
    name: 'options',
    label: t('fields.options'),
    kind: 'options',
    help: t('help.options'),
    defaultValue: [],
  },
  { name: 'factKey', label: t('fields.factKey'), kind: 'text', required: true, help: t('help.factKey') },
  { name: 'required', label: t('fields.required'), kind: 'boolean' },
  { name: 'tags.personaKeys', label: t('fields.personaKeys'), kind: 'list', required: true },
  { name: 'tags.scenarioKeys', label: t('fields.scenarioKeys'), kind: 'list', help: t('help.scenarioKeys') },
  { name: 'tags.sectors', label: t('fields.sectors'), kind: 'list', required: true, help: t('help.sectors', { sectors: sectors.join('; ') }) },
  { name: 'tags.category', label: t('fields.category'), kind: 'text', help: t('help.category') },
  {
    name: 'branchTrigger',
    label: t('fields.branchTrigger'),
    kind: 'branch',
    help: t('help.branchTrigger'),
  },
  { name: 'scoringHint', label: t('fields.scoringHint'), kind: 'text', help: t('help.scoringHint') },
  ];
}

export default function QuestionsPage() {
  const t = useTranslations('admin.questions');
  const locale = useLocale();
  const workspace = useWorkspace();
  const fields = questionFields(t, workspace?.sectors ?? []);
  return (
    <div className="page-shell">
      <ContentManager
      title={t('title')}
      description={t('description')}
      requirements={['FR-15']}
      entity={t('entity')}
      apiClient={questionsApi}
      fields={fields}
      columns={[]}
      summary={(items) => {
        const sectors = new Set(items.flatMap((item) => tagsOf(item).sectors ?? []));
        const counters = [
          { key: 'total', value: items.length },
          { key: 'active', value: items.filter((item) => item.status !== 'retired').length },
          { key: 'retired', value: items.filter((item) => item.status === 'retired').length },
          { key: 'sectors', value: sectors.size },
        ] as const;
        return (
          <section className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {counters.map((counter, index) => {
              const tone = SUMMARY_TONE[index]!;
              const Icon = tone.icon;
              return (
                <div key={counter.key} className="flex items-center gap-3 bg-card p-4">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone.tile}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="metric-value">{counter.value.toLocaleString(locale)}</p>
                    <p className="text-xs text-muted-foreground">{t(`summary.${counter.key}`)}</p>
                  </div>
                </div>
              );
            })}
          </section>
        );
      }}
      card={(item) => {
        const tags = tagsOf(item);
        const pills = [...(tags.personaKeys ?? []), ...(tags.sectors ?? [])];
        return {
          icon: <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileQuestion className="size-5" aria-hidden="true" /></span>,
          title: String(item.text ?? item.key ?? ''),
          body: (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {pills.map((pill) => (
                <Badge key={pill} variant="secondary">{pill}</Badge>
              ))}
              {item.createdAt ? <span className="text-xs">{t('card.created', { date: new Date(String(item.createdAt)).toLocaleDateString(locale) })}</span> : null}
              {item.updatedAt ? <span className="text-xs">{t('card.updated', { date: new Date(String(item.updatedAt)).toLocaleDateString(locale) })}</span> : null}
            </span>
          ),
        };
      }}
      facets={[
        { key: 'tags.personaKeys', label: t('fields.personaKeys') },
        { key: 'tags.scenarioKeys', label: t('fields.scenarioKeys') },
        { key: 'tags.sectors', label: t('fields.sectors') },
      ]}
      versioned={false}
      />
    </div>
  );
}
