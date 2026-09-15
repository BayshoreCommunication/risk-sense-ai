'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, handleSessionResponse, toApiError } from '@/lib/api/client';
import { DEV_AUTH_ENABLED } from '@/lib/environment';
import { COOKIE_DEV_USER, COOKIE_SESSION, readCookie } from '@/lib/session';

type RowError = { sheet: string; row: number; column?: string; message: string };
type Dataset = {
  _id: string;
  seq: number;
  fileName: string;
  format: 'xlsx' | 'json';
  status: 'rejected' | 'validated' | 'approved' | 'active' | 'failed';
  counts: { personas: number; scenarios: number; questions: number; scoring: number; skippedRows: number };
  validationErrors: RowError[];
  authorId: string;
  reviewerId?: string;
  failure?: string;
  createdAt: string;
  applied?: { personas: string[]; scenarios: string[]; questions: string[] };
};

const STATUS_VARIANT: Record<Dataset['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  approved: 'secondary',
  validated: 'secondary',
  rejected: 'destructive',
  failed: 'destructive',
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Raw fetch for the two calls the typed client cannot express well: multipart upload and binary download. */
async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  const sessionId = readCookie(COOKIE_SESSION);
  if (sessionId) h['X-Session-Id'] = sessionId;
  const devUser = DEV_AUTH_ENABLED ? readCookie(COOKIE_DEV_USER) : undefined;
  if (devUser) h['X-Dev-User'] = devUser;
  else {
    const { getFirebaseAuth } = await import('@/lib/firebase/client');
    const token = await getFirebaseAuth()?.currentUser?.getIdToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }
  return h;
}

/**
 * Datasets (FR-13, FR-14, AI-06): upload TAC's workbook → row-level validation → approval by a second
 * administrator → activation (creates/versions personas, questions, scenarios).
 */
export default function DatasetsPage() {
  const locale = useLocale();
  const t = useTranslations('admin.datasets');
  const [items, setItems] = useState<Dataset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = (await api.GET('/datasets')) as { data?: { data: unknown }; error?: unknown };
    if (!res.data) {
      setError(toApiError(res.error).message);
      return;
    }
    setItems(res.data.data as Dataset[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await handleSessionResponse(await fetch(`${apiBase}/datasets`, { method: 'POST', body: form, headers: await authHeaders() }));
    const body = await res.json();
    if (!res.ok) throw body;
    setFile(null);
    setExpanded(body.data._id);
  }

  async function downloadTemplate() {
    const res = await handleSessionResponse(await fetch(`${apiBase}/datasets/template`, { headers: await authHeaders() }));
    if (!res.ok) throw await res.json();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'risksense-content-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button variant="outline" onClick={() => void run(downloadTemplate)} disabled={busy}>
          {t('downloadTemplate')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('upload.title')}</CardTitle>
          <CardDescription>{t('upload.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input aria-label={t('upload.fileLabel')} type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-sm" />
          <Button onClick={() => void run(upload)} disabled={!file || busy}>
            {busy ? t('upload.working') : t('upload.submit')}
          </Button>
        </CardContent>
      </Card>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{error}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t('columns.file')}</TableHead>
              <TableHead>{t('columns.personas')}</TableHead>
              <TableHead>{t('columns.scenarios')}</TableHead>
              <TableHead>{t('columns.questions')}</TableHead>
              <TableHead>{t('columns.errors')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead className="text-right">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((d) => (
              <TableRow key={d._id}>
                <TableCell>{d.seq}</TableCell>
                <TableCell>
                  <div>{d.fileName}</div>
                  <div className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString(locale)}</div>
                </TableCell>
                <TableCell>{d.counts.personas}</TableCell>
                <TableCell>{d.counts.scenarios}</TableCell>
                <TableCell>{d.counts.questions}</TableCell>
                <TableCell>
                  {d.validationErrors.length > 0 ? (
                    <button className="underline" onClick={() => setExpanded(expanded === d._id ? null : d._id)}>
                      {d.validationErrors.length}
                    </button>
                  ) : (
                    '0'
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
                  {d.failure && <div className="mt-1 text-xs text-destructive">{d.failure}</div>}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  {d.status === 'validated' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
                      const res = await api.POST('/datasets/{id}/approve', { params: { path: { id: d._id } } });
                      if (res.error) throw res.error;
                    })}>
                      {t('actions.approve')}
                    </Button>
                  )}
                  {d.status === 'approved' && (
                    <Button size="sm" disabled={busy} onClick={() => void run(async () => {
                      const res = await api.POST('/datasets/{id}/activate', { params: { path: { id: d._id } } });
                      if (res.error) throw res.error;
                    })}>
                      {t('actions.activate')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {expanded && items.find((d) => d._id === expanded)?.validationErrors.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('validation.title', { sequence: items.find((d) => d._id === expanded)?.seq ?? '' })}</CardTitle>
            <CardDescription>{t('validation.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('validation.columns.sheet')}</TableHead>
                  <TableHead>{t('validation.columns.row')}</TableHead>
                  <TableHead>{t('validation.columns.column')}</TableHead>
                  <TableHead>{t('validation.columns.message')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items
                  .find((d) => d._id === expanded)!
                  .validationErrors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.sheet}</TableCell>
                      <TableCell>{e.row || '—'}</TableCell>
                      <TableCell>{e.column ?? '—'}</TableCell>
                      <TableCell>{e.message}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
