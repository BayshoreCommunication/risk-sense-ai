import { api, toApiError } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/types';

/** PAID reports & analytics (FR-26..28, DASH-03). Shapes come from the backend's OpenAPI spec. */
export type ReportResult = components['schemas']['ReportResult'];
export type ReportRow = ReportResult['rows'][number];
export type ReportType = 'volume' | 'classification' | 'override-rate' | 'assessment-time';
export type ReportQuery = NonNullable<paths['/reports/{type}']['get']['parameters']['query']>;
export type TrendsQuery = NonNullable<paths['/analytics/trends']['get']['parameters']['query']>;

function unwrap<T>(res: { data?: { data: unknown }; error?: unknown }): T {
  if (!res.data) throw toApiError(res.error);
  return res.data.data as T;
}

export const reports = {
  get: async (type: ReportType, query: ReportQuery = {}) => unwrap<ReportResult>(await api.GET('/reports/{type}', { params: { path: { type }, query } })),
  trends: async (query: TrendsQuery = {}) => unwrap<ReportResult>(await api.GET('/analytics/trends', { params: { query } })),
  /** FR-28: downloads go through the API client (auth headers), never a bare link. Returns the blob + file name. */
  export: async (type: ReportType, format: 'csv' | 'pdf', query: ReportQuery = {}) => {
    const res = await api.GET('/reports/{type}/export', { params: { path: { type }, query: { ...query, format } }, parseAs: 'blob' });
    if (!res.response.ok) throw toApiError(res.error);
    const disposition = res.response.headers.get('content-disposition') ?? '';
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `risksense-${type}.${format}`;
    return { blob: res.data as Blob, name };
  },
};

/** Trigger a browser download for a blob (object URL is revoked afterwards). */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtSeconds = (s: number | null | undefined) => {
  if (s === null || s === undefined) return '—';
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
};

export function fmtCell(v: unknown, kind: 'text' | 'number' | 'percent' | 'seconds'): string {
  if (v === null || v === undefined) return '—';
  if (kind === 'percent') return `${v}%`;
  if (kind === 'seconds') return fmtSeconds(Number(v));
  if (kind === 'number') return typeof v === 'number' ? v.toLocaleString() : String(v);
  return String(v);
}
