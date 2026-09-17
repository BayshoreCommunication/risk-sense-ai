'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/PageHeader';
import { ScoringMatrixEditor } from '@/components/admin/ScoringMatrixEditor';

/**
 * Administrator scoring matrix configuration (FR-18, FR-19), laid out as
 * docs/design/figma-frames/15-admin-scoring-matrix.png.
 *
 * Only the weighted factors are editable here. Creating a matrix, fact→factor mappings, the FR-20
 * confidence gates and the AI-05 approval lifecycle have no screen — see ISS-033. Saving weights
 * still creates a draft version that an administrator other than the author must approve and
 * activate through the API before it scores anything.
 */
export default function ScoringPage() {
  const t = useTranslations('admin.scoring');
  return (
    <div className="page-shell">
      <PageHeader title={t('title')} requirements={['FR-18', 'FR-19']} />
      <ScoringMatrixEditor />
    </div>
  );
}
