'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, ChevronUp, Download, FileSpreadsheet, Power, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, handleSessionResponse, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';
import { DEV_AUTH_ENABLED } from '@/lib/environment';
import { COOKIE_DEV_USER, COOKIE_SESSION, readCookie } from '@/lib/session';

type Dataset = components['schemas']['Dataset'];

function contentRows(dataset: Dataset) {
  return dataset.counts.personas + dataset.counts.scenarios + dataset.counts.questions + dataset.counts.scoring;
}

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
      const res = await api.GET('/datasets');
      if (!res.data) {
        setError(toApiError(res.error).message);
        return;
      }
      setItems(res.data.data);
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

  function actionsFor(dataset: Dataset) {
    if (dataset.status !== 'validated' && dataset.status !== 'approved') return null;
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {dataset.status === 'validated' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
            const res = await api.POST('/datasets/{id}/approve', { params: { path: { id: dataset._id } } });
            if (res.error) throw res.error;
          })}>
            <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
            {t('actions.approve')}
          </Button>
        )}
        {dataset.status === 'approved' && (
          <Button size="sm" disabled={busy} onClick={() => void run(async () => {
            const res = await api.POST('/datasets/{id}/activate', { params: { path: { id: dataset._id } } });
            if (res.error) throw res.error;
          })}>
            <Power data-icon="inline-start" aria-hidden="true" />
            {t('actions.activate')}
          </Button>
        )}
      </div>
    );
  }

  function errorCountFor(dataset: Dataset) {
    if (dataset.validationErrors.length === 0) return <span className="tabular-nums">0</span>;
    return (
      <button
        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 font-medium text-destructive underline-offset-4 hover:bg-destructive/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setExpanded(expanded === dataset._id ? null : dataset._id)}
        aria-expanded={expanded === dataset._id}
        aria-controls={`dataset-errors-${dataset._id}`}
      >
        {dataset.validationErrors.length}
        {expanded === dataset._id ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
      </button>
    );
  }

  const activeCount = items.filter((dataset) => dataset.status === 'active').length;
  const reviewCount = items.filter((dataset) => dataset.status === 'validated').length;
  const activationCount = items.filter((dataset) => dataset.status === 'approved').length;
  const unavailableCount = items.filter((dataset) => dataset.status === 'rejected' || dataset.status === 'failed').length;

  return (
    <div className="page-shell">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['FR-13', 'FR-14']}
        actions={
          <Button variant="outline" onClick={() => void run(downloadTemplate)} disabled={busy} className="shrink-0 bg-background">
            <Download data-icon="inline-start" aria-hidden="true" />
            {t('downloadTemplate')}
          </Button>
        }
      />

      <section className="grid overflow-hidden rounded-xl sm:grid-cols-2 xl:grid-cols-5" aria-label={t('summary.label')}>
        <Card size="sm" className="rounded-none shadow-none"><CardHeader><CardDescription>{t('summary.total')}</CardDescription><CardTitle className="metric-value">{loading ? '—' : items.length}</CardTitle></CardHeader></Card>
        <Card size="sm" className="rounded-none shadow-none"><CardHeader><CardDescription>{t('summary.active')}</CardDescription><CardTitle className="metric-value text-emerald-700">{loading ? '—' : activeCount}</CardTitle></CardHeader></Card>
        <Card size="sm" className="rounded-none shadow-none"><CardHeader><CardDescription>{t('summary.review')}</CardDescription><CardTitle className="metric-value text-amber-700">{loading ? '—' : reviewCount}</CardTitle></CardHeader></Card>
        <Card size="sm" className="rounded-none shadow-none"><CardHeader><CardDescription>{t('summary.activation')}</CardDescription><CardTitle className="metric-value text-blue-700">{loading ? '—' : activationCount}</CardTitle></CardHeader></Card>
        <Card size="sm" className="rounded-none shadow-none"><CardHeader><CardDescription>{t('summary.unavailable')}</CardDescription><CardTitle className="metric-value text-slate-600">{loading ? '—' : unavailableCount}</CardTitle></CardHeader></Card>
      </section>

      <Card className="shadow-none">
        <CardHeader className="border-b pb-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <UploadCloud className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base">{t('upload.title')}</CardTitle>
              <CardDescription className="mt-1 leading-5">{t('upload.description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-xl rounded-lg border border-dashed border-primary/30 bg-primary/[0.025] p-2">
            <Input aria-label={t('upload.fileLabel')} type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full border-0 bg-transparent shadow-none" />
          </div>
          <Button onClick={() => void run(upload)} disabled={!file || busy} className="shrink-0">
            <FileSpreadsheet data-icon="inline-start" aria-hidden="true" />
            {busy ? t('upload.working') : t('upload.submit')}
          </Button>
        </CardContent>
      </Card>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}

      <section className="data-panel hidden overflow-x-auto lg:block" aria-busy={loading}>
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t('columns.file')}</TableHead>
              <TableHead className="text-right">{t('columns.rows')}</TableHead>
              <TableHead className="text-right">{t('columns.errors')}</TableHead>
              <TableHead>{t('columns.author')}</TableHead>
              <TableHead>{t('columns.reviewer')}</TableHead>
              <TableHead>{t('columns.uploaded')}</TableHead>
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
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="font-semibold tabular-nums">{contentRows(d)}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {t('columns.personas')} {d.counts.personas} · {t('columns.scenarios')} {d.counts.scenarios} · {t('columns.questions')} {d.counts.questions}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{errorCountFor(d)}</TableCell>
                <TableCell className="max-w-44 truncate font-medium" title={d.author?.name}>{d.author?.name ?? '—'}</TableCell>
                <TableCell className="max-w-44 truncate" title={d.reviewer?.name}>{d.reviewer?.name ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground"><time dateTime={d.createdAt}>{new Date(d.createdAt).toLocaleString(locale)}</time></TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[d.status]}>{statusT.has(d.status) ? statusT(d.status) : d.status}</Badge>
                  {d.failure && <div className="mt-1 text-xs text-destructive">{d.failure}</div>}
                </TableCell>
                <TableCell>{actionsFor(d)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="data-panel divide-y lg:hidden" aria-busy={loading}>
        {loading && <p className="px-4 py-12 text-center text-sm text-muted-foreground">{commonT('loading')}</p>}
        {!loading && items.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>}
        {items.map((d) => (
          <article key={d._id} className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <h2 className="truncate font-semibold" title={d.fileName}>{d.fileName}</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  #{d.seq} · <span className="uppercase">{d.format}</span> · {t('columns.uploaded')} <time dateTime={d.createdAt}>{new Date(d.createdAt).toLocaleString(locale)}</time>
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[d.status]}>{statusT.has(d.status) ? statusT(d.status) : d.status}</Badge>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('columns.author')}</dt>
                <dd className="mt-0.5 truncate font-medium" title={d.author?.name}>{d.author?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('columns.reviewer')}</dt>
                <dd className="mt-0.5 truncate font-medium" title={d.reviewer?.name}>{d.reviewer?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('columns.rows')}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{contentRows(d)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('columns.errors')}</dt>
                <dd className="mt-0.5">{errorCountFor(d)}</dd>
              </div>
            </dl>

            <p className="text-xs leading-5 text-muted-foreground">
              {t('columns.personas')} {d.counts.personas} · {t('columns.scenarios')} {d.counts.scenarios} · {t('columns.questions')} {d.counts.questions}
            </p>
            {d.failure && <p className="text-xs text-destructive">{d.failure}</p>}
            {actionsFor(d)}
          </article>
        ))}
      </section>

      {expanded && items.find((d) => d._id === expanded)?.validationErrors.length ? (
        <Card id={`dataset-errors-${expanded}`} className="border-destructive/20 shadow-none">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">{t('validation.title', { sequence: items.find((d) => d._id === expanded)?.seq ?? '' })}</CardTitle>
            <CardDescription className="leading-5">{t('validation.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table className="min-w-[620px]">
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
            </div>
            <div className="divide-y md:hidden">
              {items
                .find((d) => d._id === expanded)!
                .validationErrors.map((e, i) => (
                  <article key={i} className="grid grid-cols-2 gap-3 py-4 text-sm first:pt-0 last:pb-0">
                    <div><p className="text-xs text-muted-foreground">{t('validation.columns.sheet')}</p><p className="mt-0.5 font-medium">{e.sheet}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t('validation.columns.row')}</p><p className="mt-0.5 font-medium tabular-nums">{e.row || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t('validation.columns.column')}</p><p className="mt-0.5">{e.column ?? '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t('validation.columns.message')}</p><p className="mt-0.5 break-words">{e.message}</p></div>
                  </article>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
