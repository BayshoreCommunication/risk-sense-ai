import { api, toApiError } from '@/lib/api/client';
import type { paths } from '@/lib/api/types';

/** Typed helpers for the requestor chat (Phase 3). Shapes mirror assessments/service.ts `view()` + turn fields. */
export type QuestionSnapshot = {
  key: string;
  text?: string;
  type: 'mcq' | 'yes_no' | 'free_text' | 'number';
  factKey?: string;
  required?: boolean;
  options?: { id: string; label: string; factValue?: unknown }[];
};

export type Fact = { key: string; value: unknown; source: 'mcq' | 'ai' | 'system'; questionKey?: string; confidence: number; flagged: boolean };

export type Result = {
  score: number;
  classification: string;
  computedClassification: string;
  ruleDriven: boolean;
  ruleKey?: string;
  ruleName?: string;
  confidence: number;
  professionalConsult: boolean;
  mandatoryReview: boolean;
  explanation: string;
  keyDrivers: string[];
  recommendedAction: string;
  nextSteps: string[];
  factors: Record<string, { value: number; weight: number; contribution: number; matchedMapping: number | null }>;
  computedAt: string;
};

export type Assessment = {
  _id: string;
  status: 'in_progress' | 'intake_complete' | 'awaiting_decision' | 'escalated' | 'closed' | 'error_review';
  phase: 'persona' | 'describe' | 'questions' | 'done';
  personaKey?: string;
  personaSource?: 'user' | 'ai';
  personaCandidates: string[];
  scenarioKey?: string;
  scenarioSource?: 'ai' | 'default';
  sector?: string;
  currentQuestionKey?: string;
  clarification?: string;
  facts: Fact[];
  result: Result | null;
  decision: { type: 'accept' | 'override' | 'escalate'; reason?: string; overriddenTo?: string; decidedAt: string } | null;
  escalatedTo: { _id: string; name: string } | null; // T-061 reviewer the escalation was routed to
  timing: { startedAt: string; intakeCompletedAt?: string; submittedAt?: string; closedAt?: string; durationSec?: number };
  createdAt: string;
  classifications: string[];
  masked?: 'pii' | 'phi' | 'financial' | null; // SEC-05: set when free text was masked for this reader
};

export type EscalationTarget = { _id: string; name: string; email: string; departmentIds: string[]; crossDepartmentAccess: boolean };

/** One row of GET /assessments (DASH-01): the dashboard fields only — no answers, facts or factor breakdown. */
export type AssessmentListItem = {
  _id: string;
  status: Assessment['status'];
  phase: Assessment['phase'];
  personaKey?: string;
  scenarioKey?: string;
  sector?: string;
  requestorId: string;
  departmentId?: string;
  requestor?: { name: string; email: string };
  department?: { name: string };
  result: Pick<Result, 'score' | 'classification' | 'confidence' | 'ruleDriven' | 'professionalConsult' | 'mandatoryReview' | 'recommendedAction' | 'explanation' | 'computedAt'> | null;
  decision: { type: 'accept' | 'override' | 'escalate'; overriddenTo?: string; decidedAt: string } | null;
  escalatedToUserId?: string;
  escalatedTo?: { name: string };
  timing: Assessment['timing'];
  createdAt: string;
};

export type AssessmentCounts = Record<Assessment['status'] | 'pending' | 'all', number>;
export type AssessmentListResult = {
  items: AssessmentListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  counts: AssessmentCounts;
  summary: { averageConfidence: number | null };
};
export type AssessmentListQuery = NonNullable<paths['/assessments']['get']['parameters']['query']>;
export type Department = { _id: string; name: string; personaIds: string[] };

export type Turn = Assessment & { nextQuestion?: QuestionSnapshot | null; intakeComplete?: boolean; missingRequired?: string[] };

export type Message = {
  _id: string;
  role: 'assistant' | 'user' | 'system';
  kind: 'info' | 'question' | 'answer' | 'clarification' | 'result' | 'decision';
  content: string;
  questionKey?: string;
  question?: QuestionSnapshot;
  createdAt: string;
};

function unwrap<T>(res: { data?: { data: unknown }; error?: unknown }): T {
  if (!res.data) throw toApiError(res.error);
  return res.data.data as T;
}

type StartBody = NonNullable<paths['/assessments']['post']['requestBody']>['content']['application/json'];
type MessageBody = NonNullable<paths['/assessments/{id}/messages']['post']['requestBody']>['content']['application/json'];
export type DecisionInput = NonNullable<paths['/assessments/{id}/decision']['post']['requestBody']>['content']['application/json'];
type DecisionBody = DecisionInput;

export const assessments = {
  start: async (body: StartBody) => unwrap<Turn>(await api.POST('/assessments', { body })),
  get: async (id: string, unmask = false) => unwrap<Assessment>(await api.GET('/assessments/{id}', { params: { path: { id }, query: unmask ? { unmask: 'true' } : {} } })),
  messages: async (id: string, unmask = false) => unwrap<Message[]>(await api.GET('/assessments/{id}/messages', { params: { path: { id }, query: unmask ? { unmask: 'true' } : {} } })),
  setPersona: async (id: string, personaKey: string) => unwrap<Turn>(await api.POST('/assessments/{id}/persona', { params: { path: { id } }, body: { personaKey } })),
  answer: async (id: string, body: MessageBody) => unwrap<Turn>(await api.POST('/assessments/{id}/messages', { params: { path: { id } }, body })),
  submit: async (id: string) => unwrap<Assessment>(await api.POST('/assessments/{id}/submit', { params: { path: { id } } })),
  escalationTargets: async (id: string) => unwrap<EscalationTarget[]>(await api.GET('/assessments/{id}/escalation-targets', { params: { path: { id } } })),
  decide: async (id: string, body: DecisionBody) => unwrap<Assessment>(await api.POST('/assessments/{id}/decision', { params: { path: { id } }, body })),
  list: async (query: AssessmentListQuery = {}) => unwrap<AssessmentListResult>(await api.GET('/assessments', { params: { query } })),
  departments: async () => unwrap<Department[]>(await api.GET('/departments')),
  personas: async () => unwrap<{ key: string; name: string; description: string; sector: string }[]>(await api.GET('/personas', { params: { query: {} } })),
};

/** The question the user should answer now: the last assistant question/clarification in the transcript. */
export function pendingQuestion(messages: Message[], a: Assessment | null): QuestionSnapshot | null {
  if (!a || a.status !== 'in_progress') return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'assistant' && (m.kind === 'question' || m.kind === 'clarification') && m.question) return m.question;
    if (m.role === 'user') return null;
  }
  return null;
}
