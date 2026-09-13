'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';
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
  const devUser = process.env.NEXT_PUBLIC_ENV !== 'production' ? readCookie(COOKIE_DEV_USER) : undefined;
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
    const res = await fetch(`${apiBase}/datasets`, { method: 'POST', body: form, headers: await authHeaders() });
    const body = await res.json();
    if (!res.ok) throw body;
    setFile(null);
    setExpanded(body.data._id);
  }

  async function downloadTemplate() {
    const res = await fetch(`${apiBase}/datasets/template`, { headers: await authHeaders() });
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
          <h1 className="text-xl font-semibold">Datasets</h1>
          <p className="text-sm text-muted-foreground">
            Upload the content workbook (personas, scenarios, questions, scoring). Rows are validated first; a second administrator approves; activation
            versions the content (FR-13, AI-06).
          </p>
        </div>
        <Button variant="outline" onClick={() => void run(downloadTemplate)} disabled={busy}>
          Download template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload workbook</CardTitle>
          <CardDescription>.xlsx in the template layout. Nothing is applied until approved and activated.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-sm" />
          <Button onClick={() => void run(upload)} disabled={!file || busy}>
            {busy ? 'Working…' : 'Upload and validate'}
          </Button>
        </CardContent>
      </Card>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{error}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Personas</TableHead>
              <TableHead>Scenarios</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Errors</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No uploads yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((d) => (
              <TableRow key={d._id}>
                <TableCell>{d.seq}</TableCell>
                <TableCell>
                  <div>{d.fileName}</div>
                  <div className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</div>
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
                      Approve
                    </Button>
                  )}
                  {d.status === 'approved' && (
                    <Button size="sm" disabled={busy} onClick={() => void run(async () => {
                      const res = await api.POST('/datasets/{id}/activate', { params: { path: { id: d._id } } });
                      if (res.error) throw res.error;
                    })}>
                      Activate
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
            <CardTitle className="text-base">Validation errors — upload #{items.find((d) => d._id === expanded)?.seq}</CardTitle>
            <CardDescription>Fix these rows in the workbook and upload again. Nothing from this file was applied.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Row</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Message</TableHead>
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
