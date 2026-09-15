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
  const classification = useTranslations('classification');
  const fields = ruleFields(t);
  const formatCondition = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '—';
    const condition = value as { all?: unknown[]; any?: unknown[]; factKey?: string; op?: string; value?: unknown };
    if (condition.all) return `(${condition.all.map(formatCondition).join(` ${t('display.and')} `)})`;
    if (condition.any) return `(${condition.any.map(formatCondition).join(` ${t('display.or')} `)})`;
    const operator: Record<string, string> = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: t('display.in'), exists: t('display.exists') };
    return `${condition.factKey ?? 'fact'} ${operator[condition.op ?? ''] ?? condition.op ?? ''}${condition.op === 'exists' ? '' : ` ${Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value ?? '')}`}`;
  };
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
        { key: 'trigger', label: t('fields.trigger'), render: (item) => <code className="text-xs">{formatCondition(item.trigger)}</code> },
        { key: 'forcedClassification', label: t('columns.forces'), render: (item) => {
          const value = String(item.forcedClassification ?? '');
          return classification.has(value) ? classification(value) : value;
        } },
      ]}
      versioned
      approval
    />
  );
}
