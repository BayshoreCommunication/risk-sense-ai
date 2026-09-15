'use client';

import { useTranslations } from 'next-intl';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { questionsApi } from '@/lib/admin/content';

function questionFields(t: ReturnType<typeof useTranslations>): FieldSpec[] {
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
  { name: 'tags.sectors', label: t('fields.sectors'), kind: 'list', required: true, help: 'financial; healthcare; it; general' },
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
  const fields = questionFields(t);
  return (
    <ContentManager
      title={t('title')}
      description={t('description')}
      entity={t('entity')}
      apiClient={questionsApi}
      fields={fields}
      columns={[
        { key: 'key', label: t('fields.key') },
        { key: 'text', label: t('columns.text') },
        { key: 'type', label: t('fields.type') },
        { key: 'factKey', label: t('fields.factKey') },
        { key: 'tags.personaKeys', label: t('columns.personas'), render: (it) => ((it.tags as { personaKeys?: string[] })?.personaKeys ?? []).join(', ') },
      ]}
      versioned={false}
    />
  );
}
