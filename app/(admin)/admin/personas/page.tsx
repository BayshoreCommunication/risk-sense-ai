'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { personasApi, scenariosApi } from '@/lib/admin/content';

export default function PersonasPage() {
  const t = useTranslations('admin.personas');
  const [scenarioCounts, setScenarioCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    scenariosApi.list().then((scenarios) => {
      if (cancelled) return;
      const counts: Record<string, number> = {};
      scenarios.filter((scenario) => scenario.status === 'active').forEach((scenario) => {
        const personaKey = String(scenario.personaKey ?? '');
        if (personaKey) counts[personaKey] = (counts[personaKey] ?? 0) + 1;
      });
      setScenarioCounts(counts);
    }).catch(() => !cancelled && setScenarioCounts({}));
    return () => {
      cancelled = true;
    };
  }, []);
  const fields: FieldSpec[] = [
    { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
    { name: 'name', label: t('fields.name'), kind: 'text', required: true },
    { name: 'sector', label: t('fields.sector'), kind: 'select', options: ['financial', 'healthcare', 'it', 'general'], required: true },
    { name: 'description', label: t('fields.description'), kind: 'textarea', required: true },
    { name: 'responsibilities', label: t('fields.responsibilities'), kind: 'list', help: t('help.separator') },
    { name: 'activities', label: t('fields.activities'), kind: 'list' },
    { name: 'commonRisks', label: t('fields.commonRisks'), kind: 'list' },
    { name: 'vocabulary', label: t('fields.vocabulary'), kind: 'list' },
    { name: 'policies', label: t('fields.policies'), kind: 'list' },
    { name: 'detectHints', label: t('fields.detectHints'), kind: 'list', help: t('help.detectHints') },
    { name: 'defaultScenarioKey', label: t('fields.defaultScenarioKey'), kind: 'text', help: t('help.defaultScenarioKey') },
  ];
  return (
    <div className="page-shell">
      <ContentManager
      title={t('title')}
      description={t('description')}
      requirements={['FR-09', 'FR-10']}
      entity={t('entity')}
      apiClient={personasApi}
      fields={fields}
      columns={[
        { key: 'name', label: t('fields.name') },
        { key: 'departmentIds', label: t('columns.departments'), render: (item) => String((item.departmentIds as string[] | undefined)?.length ?? 0) },
        { key: 'key', label: t('columns.scenarios'), render: (item) => String(scenarioCounts[String(item.key ?? '')] ?? 0) },
      ]}
      versioned
      />
    </div>
  );
}
