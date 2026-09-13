'use client';

import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { personasApi } from '@/lib/admin/content';

const fields: FieldSpec[] = [
  { name: 'key', label: 'Key', kind: 'text', required: true, immutable: true, help: 'lowercase snake_case, e.g. finance_officer — cannot change later' },
  { name: 'name', label: 'Name', kind: 'text', required: true },
  { name: 'sector', label: 'Sector', kind: 'select', options: ['financial', 'healthcare', 'it', 'general'], required: true },
  { name: 'description', label: 'Description', kind: 'textarea', required: true },
  { name: 'responsibilities', label: 'Responsibilities', kind: 'list', help: 'Separate with ;' },
  { name: 'activities', label: 'Activities', kind: 'list' },
  { name: 'commonRisks', label: 'Common risks', kind: 'list' },
  { name: 'vocabulary', label: 'Vocabulary', kind: 'list' },
  { name: 'policies', label: 'Policies', kind: 'list' },
  { name: 'detectHints', label: 'Detect hints', kind: 'list', help: 'Words a user might type that suggest this persona (FR-04)' },
  { name: 'defaultScenarioKey', label: 'Default scenario key', kind: 'text', help: 'Fallback when no scenario matches (FR-05)' },
];

export default function PersonasPage() {
  return (
    <ContentManager
      title="Personas"
      description="Role profiles that drive vocabulary, scenarios and questions (FR-09). Edits to an active persona create a new draft version."
      entity="persona"
      apiClient={personasApi}
      fields={fields}
      columns={[
        { key: 'key', label: 'Key' },
        { key: 'name', label: 'Name' },
        { key: 'sector', label: 'Sector' },
      ]}
      versioned
    />
  );
}
