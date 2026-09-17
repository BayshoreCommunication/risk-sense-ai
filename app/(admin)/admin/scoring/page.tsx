'use client';

import { useTranslations } from 'next-intl';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { PageHeader } from '@/components/shell/PageHeader';
import { ScoringMatrixEditor } from '@/components/admin/ScoringMatrixEditor';
import { matricesApi } from '@/lib/admin/content';

const factorExample = { weight: 25, scale: { min: 1, max: 5 }, mapping: [{ when: { factKey: 'amount_usd', op: 'gt', value: 100000 }, value: 5 }] };

function matrixFields(t: ReturnType<typeof useTranslations>): FieldSpec[] {
  return [
    { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
    { name: 'name', label: t('fields.name'), kind: 'text', required: true },
    { name: 'sector', label: t('fields.sector'), kind: 'select', options: ['financial', 'healthcare', 'it', 'general'] },
    {
      name: 'factors',
      label: t('fields.factors'),
      kind: 'factors',
      required: true,
      help: t('help.factors'),
      defaultValue: {
        impact: factorExample,
        likelihood: { ...factorExample, weight: 20, mapping: [] },
        severity: { ...factorExample, weight: 20, mapping: [] },
        controlEffectiveness: { ...factorExample, weight: 15, mapping: [] },
        regulatorySensitivity: { ...factorExample, weight: 15, mapping: [] },
        duration: { ...factorExample, weight: 5, mapping: [] },
      },
    },
    {
      name: 'thresholds',
      label: t('fields.thresholds'),
      kind: 'thresholds',
      required: true,
      help: t('help.thresholds'),
      defaultValue: { monitor_only: { min: 0, max: 25 }, risk: { min: 26, max: 50 }, elevated_risk: { min: 51, max: 75 }, issue: { min: 76, max: 100 } },
    },
    {
      name: 'confidence',
      label: t('fields.confidence'),
      kind: 'confidence',
      defaultValue: { professionalConsultBelow: 60, mandatoryReviewBelow: 40 },
      help: t('help.confidence'),
    },
  ];
}

/**
 * Administrator scoring matrix configuration (FR-18, FR-19). The weighted-factor editor and the
 * classification thresholds follow docs/design/figma-frames/15-admin-scoring-matrix.png. Creating a
 * matrix, editing fact mappings and confidence gates (FR-20) and the approval lifecycle (AI-05) have
 * no frame, so they stay below as a subordinate section.
 */
export default function ScoringPage() {
  const t = useTranslations('admin.scoring');
  return (
    <div className="page-shell">
      <PageHeader title={t('title')} requirements={['FR-18', 'FR-19']} />
      <ScoringMatrixEditor />
      <ContentManager
        title={t('versionsTitle')}
        description={t('description')}
        hideHeader
        entity={t('entity')}
        apiClient={matricesApi}
        fields={matrixFields(t)}
        columns={[
          { key: 'name', label: t('fields.name') },
          { key: 'sector', label: t('fields.sector') },
          { key: 'approvedBy', label: t('columns.approved'), render: (it) => (it.approvedBy ? t('yes') : '—') },
        ]}
        versioned
        approval
      />
    </div>
  );
}
