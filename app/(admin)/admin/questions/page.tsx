'use client';

import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { questionsApi } from '@/lib/admin/content';

const fields: FieldSpec[] = [
  { name: 'key', label: 'Key', kind: 'text', required: true, immutable: true, help: 'e.g. fin_q06_fraud_suspected' },
  { name: 'text', label: 'Question text', kind: 'textarea', required: true },
  { name: 'type', label: 'Type', kind: 'select', options: ['yes_no', 'mcq', 'number', 'free_text'], required: true },
  {
    name: 'options',
    label: 'Options (JSON, mcq only)',
    kind: 'json',
    help: 'At least 2 for mcq; factValue is what lands in the fact',
    example: [
      { id: 'active', label: 'Still active', factValue: 'active' },
      { id: 'contained', label: 'Contained', factValue: 'contained' },
    ],
  },
  { name: 'factKey', label: 'Fact key', kind: 'text', required: true, help: 'snake_case; scoring and rules read this (FR-06)' },
  { name: 'required', label: 'Required', kind: 'boolean' },
  { name: 'tags.personaKeys', label: 'Persona keys', kind: 'list', required: true },
  { name: 'tags.scenarioKeys', label: 'Scenario keys', kind: 'list', help: 'Empty = all scenarios of the tagged personas' },
  { name: 'tags.sectors', label: 'Sectors', kind: 'list', required: true, help: 'financial; healthcare; it; general' },
  { name: 'tags.category', label: 'Category', kind: 'text', help: 'e.g. Cybersecurity, Risk Mitigation' },
  {
    name: 'branchTrigger',
    label: 'Branch trigger (JSON)',
    kind: 'json',
    help: 'Follow-up questions asked when the answer equals onValue (FR-07)',
    example: { onValue: true, questionKeys: ['fin_q06a_fraud_confirmed'] },
  },
  { name: 'scoringHint', label: 'Scoring hint', kind: 'text', help: 'Note for TAC; scoring reads matrices, not this' },
];

export default function QuestionsPage() {
  return (
    <ContentManager
      title="Questions"
      description="Question bank tagged by persona, scenario and sector (FR-15). Retired questions stay on historical assessments."
      entity="question"
      apiClient={questionsApi}
      fields={fields}
      columns={[
        { key: 'key', label: 'Key' },
        { key: 'text', label: 'Text' },
        { key: 'type', label: 'Type' },
        { key: 'factKey', label: 'Fact key' },
        { key: 'tags.personaKeys', label: 'Personas', render: (it) => ((it.tags as { personaKeys?: string[] })?.personaKeys ?? []).join(', ') },
      ]}
      versioned={false}
    />
  );
}
