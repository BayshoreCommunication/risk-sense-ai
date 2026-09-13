'use client';

import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { rulesApi } from '@/lib/admin/content';

const fields: FieldSpec[] = [
  { name: 'key', label: 'Key', kind: 'text', required: true, immutable: true, help: 'e.g. confirmed_fraud' },
  { name: 'name', label: 'Name', kind: 'text', required: true },
  { name: 'description', label: 'Description', kind: 'textarea' },
  {
    name: 'trigger',
    label: 'Trigger condition (JSON)',
    kind: 'json',
    required: true,
    help: 'Leaf: { factKey, op, value } with op eq|ne|gt|gte|lt|lte|in|exists. Group: { all: [...] } or { any: [...] } (FR-16)',
    example: { factKey: 'fraud_confirmed', op: 'eq', value: 'confirmed' },
  },
  { name: 'forcedClassification', label: 'Forced classification', kind: 'select', options: ['monitor_only', 'risk', 'elevated_risk', 'issue'], required: true },
  { name: 'forcedAction', label: 'Forced action', kind: 'text', help: 'Optional recommended action shown with the rule-driven result' },
  { name: 'priority', label: 'Priority', kind: 'number', help: 'Lower wins when several rules fire; ties → most severe' },
  { name: 'sectors', label: 'Sectors', kind: 'list', help: 'Empty = all sectors' },
];

export default function RulesPage() {
  return (
    <ContentManager
      title="Hard rules"
      description="Rules that override the computed score when their trigger matches (FR-16, FR-17). Change control: draft → approved by another administrator → active (AI-05). Any edit returns a rule to draft."
      entity="question"
      apiClient={rulesApi}
      fields={fields}
      columns={[
        { key: 'priority', label: 'Priority' },
        { key: 'key', label: 'Key' },
        { key: 'name', label: 'Name' },
        { key: 'forcedClassification', label: 'Forces' },
      ]}
      versioned={false}
      approval
    />
  );
}
