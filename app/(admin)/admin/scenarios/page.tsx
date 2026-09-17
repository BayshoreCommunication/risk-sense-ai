'use client';

import { useTranslations } from 'next-intl';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { scenariosApi } from '@/lib/admin/content';

function scenarioFields(t: ReturnType<typeof useTranslations>): FieldSpec[] {
  return [
  { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
  { name: 'personaKey', label: t('fields.personaKey'), kind: 'text', required: true, immutable: true },
  { name: 'name', label: t('fields.name'), kind: 'text', required: true, help: t('help.name') },
  { name: 'description', label: t('fields.description'), kind: 'textarea', required: true },
  { name: 'businessContext', label: t('fields.businessContext'), kind: 'textarea', required: true },
  { name: 'learningObjective', label: t('fields.learningObjective'), kind: 'textarea' },
  { name: 'riskIndicators', label: t('fields.riskIndicators'), kind: 'list' },
  {
    name: 'conversationFlow',
    label: t('fields.conversationFlow'),
    kind: 'flow',
    required: true,
    help: t('help.conversationFlow'),
    defaultValue: [],
  },
  { name: 'requiredFactKeys', label: t('fields.requiredFactKeys'), kind: 'list', help: t('help.requiredFactKeys') },
  { name: 'expectedClassification', label: t('fields.expectedClassification'), kind: 'select', options: ['monitor_only', 'risk', 'elevated_risk', 'issue'] },
  { name: 'reasoningExample', label: t('fields.reasoningExample'), kind: 'textarea', help: t('help.reasoningExample') },
  {
    name: 'recommendedActions',
    label: t('fields.recommendedActions'),
    kind: 'actions',
    defaultValue: {},
  },
  ];
}

export default function ScenariosPage() {
  const t = useTranslations('admin.scenarios');
  const fields = scenarioFields(t);
  return (
    <div className="page-shell">
      <ContentManager
      title={t('title')}
      description={t('description')}
      requirements={['FR-11', 'FR-12']}
      entity={t('entity')}
      apiClient={scenariosApi}
      fields={fields}
      columns={[
        { key: 'personaKey', label: t('columns.persona') },
        { key: 'name', label: t('fields.name') },
        { key: 'conversationFlow', label: t('columns.questions'), render: (it) => String((it.conversationFlow as unknown[] | undefined)?.length ?? 0) },
      ]}
      versioned
      />
    </div>
  );
}
