import { api, toApiError } from '@/lib/api/client';
import type { paths } from '@/lib/api/types';

/** Read-only audit helpers (SEC-07, FR-26). No write path exists on purpose. */
export type AuditLogEntry = {
  _id: string;
  seq: number;
  category: string;
  action: string;
  actorUserId?: string;
  actorRole?: string;
  entity: { type: string; id: string; version?: number };
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: string;
};

export type AuditListQuery = NonNullable<paths['/audit-logs']['get']['parameters']['query']>;

export type TimelineStep = { seq: number; at: string | null; action: string; actor: { id: string | null; role: string | null }; summary: string; detail: Record<string, unknown> };
export type Reconstruction = {
  assessmentId: string;
  plan: 'free' | 'paid';
  fullAudit: boolean;
  entries: number;
  integrity: { ok: boolean; checked: number; badSeqs: number[] };
  completeness: 'full' | 'partial' | 'empty';
  missing: string[];
  timeline: TimelineStep[];
  state: {
    personaKey: string | null;
    scenarioKey: string | null;
    versions: Record<string, unknown> | null;
    answers: { questionKey: string; answer: unknown; branched: string[] | number }[];
    facts: Record<string, unknown>;
    rules: { fired: unknown[]; winner: string | null } | null;
    score: number | null;
    computedClassification: string | null;
    classification: string | null;
    ruleDriven: boolean | null;
    confidence: number | null;
    recommendedAction: string | null;
    explanation: string | null;
    decisions: { type: string; overriddenTo: string | null; escalatedToUserId: string | null; reason: string | null; byUserId: string | null; at: string | null }[];
    status: string;
  };
  conformance: { matches: boolean; differences: { field: string; fromAudit: unknown; stored: unknown }[] };
};

function unwrap<T>(res: { data?: { data: unknown }; error?: unknown }): T {
  if (!res.data) throw toApiError(res.error);
  return res.data.data as T;
}

export const auditApi = {
  list: async (query: AuditListQuery = {}) => unwrap<{ items: AuditLogEntry[]; nextCursorSeq: number | null }>(await api.GET('/audit-logs', { params: { query } })),
  verify: async () => unwrap<{ ok: boolean; checked: number; firstBadSeq?: number }>(await api.GET('/audit-logs/verify')),
  reconstruct: async (assessmentId: string) => unwrap<Reconstruction>(await api.GET('/assessments/{id}/reconstruct', { params: { path: { id: assessmentId } } })),
};
