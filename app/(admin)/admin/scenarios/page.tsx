'use client';

import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { scenariosApi } from '@/lib/admin/content';

const fields: FieldSpec[] = [
  { name: 'key', label: 'Key', kind: 'text', required: true, immutable: true, help: 'e.g. fin_unauthorized_transaction' },
  { name: 'personaKey', label: 'Persona key', kind: 'text', required: true, immutable: true },
  { name: 'name', label: 'Name', kind: 'text', required: true, help: 'Shown to the user before scenario questions (FR-05)' },
  { name: 'description', label: 'Description', kind: 'textarea', required: true },
  { name: 'businessContext', label: 'Business context', kind: 'textarea', required: true },
  { name: 'learningObjective', label: 'Learning objective', kind: 'textarea' },
  { name: 'riskIndicators', label: 'Risk indicators', kind: 'list' },
  {
    name: 'conversationFlow',
    label: 'Conversation flow (JSON)',
    kind: 'json',
    required: true,
    help: 'Ordered question keys. Branch follow-ups are configured on the question itself (FR-07).',
    example: [{ questionKey: 'fin_q01_process' }, { questionKey: 'fin_q04_authorized' }],
  },
  { name: 'requiredFactKeys', label: 'Required fact keys', kind: 'list', help: 'Must be answered before submit (FR-03); activation checks a question produces each' },
  { name: 'expectedClassification', label: 'Expected classification', kind: 'select', options: ['monitor_only', 'risk', 'elevated_risk', 'issue'] },
  { name: 'reasoningExample', label: 'Reasoning example', kind: 'textarea', help: 'How the explanation should read (AI-02)' },
  {
    name: 'recommendedActions',
    label: 'Recommended actions (JSON)',
    kind: 'json',
    example: {
      monitor_only: { decisionRecommendation: 'No further action', nextSteps: ['Monitor'] },
      risk: { decisionRecommendation: 'Manage the Risk', nextSteps: ['Manage the Risk'] },
      elevated_risk: { decisionRecommendation: 'Further Professional Risk Guidance Needed', nextSteps: ['Disclose/Report Issue'] },
      issue: { decisionRecommendation: 'Contact Law Enforcement', nextSteps: ['Disclose/Report Issue'] },
    },
  },
];

export default function ScenariosPage() {
  return (
    <ContentManager
      title="Scenarios"
      description="Risk situations per persona (FR-11). Activation requires an active persona, existing active questions in the flow and coverage of every required fact (FR-12, FR-03)."
      entity="scenario"
      apiClient={scenariosApi}
      fields={fields}
      columns={[
        { key: 'personaKey', label: 'Persona' },
        { key: 'key', label: 'Key' },
        { key: 'name', label: 'Name' },
        { key: 'conversationFlow', label: 'Questions', render: (it) => String((it.conversationFlow as unknown[] | undefined)?.length ?? 0) },
      ]}
      versioned
    />
  );
}
