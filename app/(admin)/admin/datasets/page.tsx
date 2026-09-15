'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, ChevronUp, Download, FileSpreadsheet, Power, UploadCloud } from 'lucide-react';
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
  const statusT = useTranslations('status');
  const commonT = useTranslations('contentManager');
  const [items, setItems] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await api.GET('/datasets')) as { data?: { data: unknown }; error?: unknown };
      if (!res.data) {
        setError(toApiError(res.error).message);
        return;
      }
      setItems(res.data.data as Dataset[]);
    } finally {
      setLoading(false);
    }
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 px-5 py-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-3xl">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t('description')}</p>
        </div>
        <Button variant="outline" onClick={() => void run(downloadTemplate)} disabled={busy} className="shrink-0 bg-background shadow-sm">
          <Download data-icon="inline-start" aria-hidden="true" />
          {t('downloadTemplate')}
        </Button>
      </header>

      <Card className="border-0 bg-card shadow-sm ring-1 ring-foreground/8">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <UploadCloud className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base">{t('upload.title')}</CardTitle>
              <CardDescription className="mt-1 leading-5">{t('upload.description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-xl rounded-xl border border-dashed border-primary/25 bg-primary/[0.025] p-2">
            <Input aria-label={t('upload.fileLabel')} type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full border-0 bg-transparent shadow-none" />
          </div>
          <Button onClick={() => void run(upload)} disabled={!file || busy} className="shrink-0 shadow-sm">
            <FileSpreadsheet data-icon="inline-start" aria-hidden="true" />
            {busy ? t('upload.working') : t('upload.submit')}
          </Button>
        </CardContent>
      </Card>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm" aria-busy={loading}>
        <Table className="min-w-[860px]">
          <TableHeader className="bg-muted/45">
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t('columns.file')}</TableHead>
              <TableHead className="text-right">{t('columns.personas')}</TableHead>
              <TableHead className="text-right">{t('columns.scenarios')}</TableHead>
              <TableHead className="text-right">{t('columns.questions')}</TableHead>
              <TableHead className="text-right">{t('columns.rows')}</TableHead>
              <TableHead className="text-right">{t('columns.errors')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead className="text-right">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  {commonT('loading')}
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((d) => (
              <TableRow key={d._id}>
                <TableCell className="font-medium tabular-nums">{d.seq}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 font-medium">
                    <FileSpreadsheet className="size-4 text-emerald-600" aria-hidden="true" />
                    {d.fileName}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-5 rounded-md px-1.5 uppercase">{d.format}</Badge>
                    <span>{new Date(d.createdAt).toLocaleString(locale)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{d.counts.personas}</TableCell>
                <TableCell className="text-right tabular-nums">{d.counts.scenarios}</TableCell>
                <TableCell className="text-right tabular-nums">{d.counts.questions}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{d.counts.personas + d.counts.scenarios + d.counts.questions + d.counts.scoring}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.validationErrors.length > 0 ? (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-destructive underline-offset-4 hover:bg-destructive/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setExpanded(expanded === d._id ? null : d._id)}
                      aria-expanded={expanded === d._id}
                      aria-controls={`dataset-errors-${d._id}`}
                    >
                      {d.validationErrors.length}
                      {expanded === d._id ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
                    </button>
                  ) : (
                    '0'
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[d.status]}>{statusT.has(d.status) ? statusT(d.status) : d.status}</Badge>
                  {d.failure && <div className="mt-1 text-xs text-destructive">{d.failure}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-max justify-end gap-1.5">
                  {d.status === 'validated' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
                      const res = await api.POST('/datasets/{id}/approve', { params: { path: { id: d._id } } });
                      if (res.error) throw res.error;
                    })}>
                      <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                      {t('actions.approve')}
                    </Button>
                  )}
                  {d.status === 'approved' && (
                    <Button size="sm" disabled={busy} onClick={() => void run(async () => {
                      const res = await api.POST('/datasets/{id}/activate', { params: { path: { id: d._id } } });
                      if (res.error) throw res.error;
                    })}>
                      <Power data-icon="inline-start" aria-hidden="true" />
                      {t('actions.activate')}
                    </Button>
                  )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {expanded && items.find((d) => d._id === expanded)?.validationErrors.length ? (
        <Card id={`dataset-errors-${expanded}`} className="border-0 bg-card shadow-sm ring-1 ring-destructive/15">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">{t('validation.title', { sequence: items.find((d) => d._id === expanded)?.seq ?? '' })}</CardTitle>
            <CardDescription className="leading-5">{t('validation.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[620px]">
              <TableHeader className="bg-muted/45">
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
