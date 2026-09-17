'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shell/PageHeader';
import { ScoringMatrixEditor } from '@/components/admin/ScoringMatrixEditor';

/**
 * Administrator scoring matrix configuration (FR-18, FR-19, FR-20), laid out as
 * docs/design/figma-frames/15-admin-scoring-matrix.png.
 *
 * Weighted factors and the confidence gates are editable here, and the draft a save produces carries
 * its own approve/activate controls so a change cannot be believed-made-but-inert (AI-05, ISS-033).
 * Creating a matrix and editing fact→factor mappings remain API-only by decision, not oversight.
 */
export default function ScoringPage() {
  const t = useTranslations('admin.scoring');
  return (
    <div className="page-shell">
      <PageHeader title={t('title')} requirements={['FR-18', 'FR-19', 'FR-20']} />
      <ScoringMatrixEditor />
    </div>
  );
}
