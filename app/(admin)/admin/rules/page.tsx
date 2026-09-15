'use client';

import { useTranslations } from 'next-intl';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { rulesApi } from '@/lib/admin/content';

function ruleFields(t: ReturnType<typeof useTranslations>): FieldSpec[] {
  return [
  { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
  { name: 'name', label: t('fields.name'), kind: 'text', required: true },
  { name: 'description', label: t('fields.description'), kind: 'textarea' },
  {
    name: 'trigger',
    label: t('fields.trigger'),
    kind: 'condition',
    required: true,
    help: t('help.trigger'),
    defaultValue: { factKey: '', op: 'eq', value: '' },
  },
  { name: 'forcedClassification', label: t('fields.forcedClassification'), kind: 'select', options: ['monitor_only', 'risk', 'elevated_risk', 'issue'], required: true },
  { name: 'forcedAction', label: t('fields.forcedAction'), kind: 'text', help: t('help.forcedAction') },
  { name: 'priority', label: t('fields.priority'), kind: 'number', help: t('help.priority') },
  { name: 'sectors', label: t('fields.sectors'), kind: 'list', help: t('help.sectors') },
  ];
}

export default function RulesPage() {
  const t = useTranslations('admin.rules');
  const fields = ruleFields(t);
  return (
    <ContentManager
      title={t('title')}
      description={t('description')}
      entity={t('entity')}
      apiClient={rulesApi}
      fields={fields}
      columns={[
        { key: 'priority', label: t('fields.priority') },
        { key: 'key', label: t('fields.key') },
        { key: 'name', label: t('fields.name') },
        { key: 'forcedClassification', label: t('columns.forces') },
      ]}
      versioned
      approval
    />
  );
}
