'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, Download, FileCheck2, Fingerprint, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';

type Manifest = {
  _id: string;
  from: string;
  to: string;
  firstSeq: number;
  lastSeq: number;
  recordCount: number;
  exportHash: string;
  actorUserId: string;
  createdAt: string;
};

function toLocalDateTime(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function readManifest(value: unknown): Manifest | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item._id !== 'string' ||
    typeof item.from !== 'string' ||
    typeof item.to !== 'string' ||
    typeof item.firstSeq !== 'number' ||
    typeof item.lastSeq !== 'number' ||
    typeof item.recordCount !== 'number' ||
    typeof item.exportHash !== 'string' ||
    typeof item.actorUserId !== 'string' ||
    typeof item.createdAt !== 'string'
  ) {
    return null;
  }
  return item as Manifest;
}

function downloadExport(payload: unknown, manifest: Manifest) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-export-${manifest.firstSeq}-${manifest.lastSeq}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** SEC-06/07: creates bounded immutable exports and reads manifests. Source audit entries are never changed. */
export default function SystemAuditArchivePage() {
  const locale = useLocale();
  const t = useTranslations('system.auditArchive');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [maxRecords, setMaxRecords] = useState(5000);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Manifest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantResult = await api.GET('/system/tenant');
      if (!tenantResult.data) {
        setError(toApiError((tenantResult as { error?: unknown }).error).message);
        return;
      }
      const fullAudit = tenantResult.data.data.features.fullAudit;
      setEnabled(fullAudit);
      if (!fullAudit) {
        setManifests([]);
        return;
      }
      const result = await api.GET('/audit-logs/archive-manifests');
      if (!result.data) {
        setError(toApiError((result as { error?: unknown }).error).message);
        return;
      }
      setManifests(result.data.data.map(readManifest).filter((item): item is Manifest => item !== null));
    } catch (loadError) {
      setError(toApiError(loadError).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeStart.getDate() - 30);
    setFrom(toLocalDateTime(rangeStart));
    setTo(toLocalDateTime(rangeEnd));
  }, []);

  async function createExport() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const rangeStart = new Date(from);
      const rangeEnd = new Date(to);
      if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeStart >= rangeEnd) {
        setError(t('invalidRange'));
        return;
      }
      const result = await api.POST('/audit-logs/archive', {
        body: {
          from: rangeStart.toISOString(),
          to: rangeEnd.toISOString(),
          maxRecords,
        },
      });
      if (!result.data) {
        setError(toApiError((result as { error?: unknown }).error).message);
        return;
      }
      const manifest = readManifest(result.data.data.manifest);
      if (!manifest) {
        setError(t('invalidResponse'));
        return;
      }
      downloadExport(result.data.data, manifest);
      setSaved(manifest);
      await load();
    } catch (exportError) {
      setError(toApiError(exportError).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const latest = manifests[0] ?? null;

  return (
    <div className="page-shell">
      <header className="workspace-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Archive className="size-4" aria-hidden="true" />
              {t('eyebrow')}
            </div>
            <h1 className="page-heading">{t('title')}</h1>
            <p className="page-description mt-2">{t('description')}</p>
          </div>
          <Badge variant={enabled ? 'outline' : 'secondary'}>{enabled ? t('enabled') : t('featureRequired')}</Badge>
        </div>
      </header>

      {enabled && (
        <div className="data-panel grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Card className="rounded-none border-0 shadow-none">
            <CardHeader>
              <CardDescription>{t('metrics.exports')}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{manifests.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-none border-0 shadow-none">
            <CardHeader>
              <CardDescription>{t('metrics.latestRecords')}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{latest?.recordCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="rounded-none border-0 shadow-none">
            <CardHeader>
              <CardDescription>{t('metrics.integrity')}</CardDescription>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-5 text-emerald-600" aria-hidden="true" />{t('metrics.immutable')}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</div>}

      {!loading && enabled === false && (
        <Card className="overflow-hidden shadow-none">
          <CardHeader>
            <CardTitle>{t('disabled.title')}</CardTitle>
            <CardDescription>{t('disabled.description')}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {enabled && (
        <Card className="overflow-hidden shadow-none">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2"><Download className="size-4 text-primary" aria-hidden="true" />{t('form.title')}</CardTitle>
            <CardDescription>{t('form.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="audit-export-from">{t('form.from')}</Label>
                <Input id="audit-export-from" type="datetime-local" value={from} onChange={(event) => { setFrom(event.target.value); setConfirm(false); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-export-to">{t('form.to')}</Label>
                <Input id="audit-export-to" type="datetime-local" value={to} onChange={(event) => { setTo(event.target.value); setConfirm(false); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-export-limit">{t('form.maxRecords')}</Label>
                <Input id="audit-export-limit" type="number" min={1} max={10000} value={maxRecords} onChange={(event) => { setMaxRecords(Number(event.target.value)); setConfirm(false); }} />
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t('form.noticeTitle')}</span> {t('form.notice')}
            </div>
            {saved && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800" role="status">
                <FileCheck2 className="size-4" aria-hidden="true" />
                {t('form.created', { count: saved.recordCount })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy || !from || !to || !Number.isFinite(maxRecords) || maxRecords < 1 || maxRecords > 10000} variant={confirm ? 'destructive' : 'default'} onClick={() => void createExport()}>
                {busy ? t('form.exporting') : confirm ? t('form.confirm') : t('form.export')}
              </Button>
              {confirm && <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>{t('form.cancel')}</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {enabled && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2"><Fingerprint className="size-4 text-primary" aria-hidden="true" />{t('history.title')}</CardTitle>
            <CardDescription>{t('history.description')}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="divide-y md:hidden">
              {!loading && manifests.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('history.empty')}</p>}
              {manifests.map((manifest) => (
                <article key={manifest._id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{new Date(manifest.createdAt).toLocaleString(locale)}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(manifest.from).toLocaleDateString(locale)} – {new Date(manifest.to).toLocaleDateString(locale)}</p></div><Badge variant="outline">{manifest.recordCount}</Badge></div>
                  <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">{t('history.columns.sequence')}</dt><dd className="mt-1 font-mono">{manifest.firstSeq}–{manifest.lastSeq}</dd></div><div><dt className="text-muted-foreground">{t('history.columns.hash')}</dt><dd className="mt-1 truncate font-mono" title={manifest.exportHash}>{manifest.exportHash.slice(0, 14)}…</dd></div></dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('history.columns.created')}</TableHead>
                    <TableHead>{t('history.columns.range')}</TableHead>
                    <TableHead className="text-right">{t('history.columns.records')}</TableHead>
                    <TableHead>{t('history.columns.sequence')}</TableHead>
                    <TableHead>{t('history.columns.hash')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && manifests.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{t('history.empty')}</TableCell></TableRow>}
                  {manifests.map((manifest) => (
                    <TableRow key={manifest._id}>
                      <TableCell className="whitespace-nowrap">{new Date(manifest.createdAt).toLocaleString(locale)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(manifest.from).toLocaleDateString(locale)} – {new Date(manifest.to).toLocaleDateString(locale)}</TableCell>
                      <TableCell className="text-right tabular-nums">{manifest.recordCount}</TableCell>
                      <TableCell className="font-mono text-xs">{manifest.firstSeq}–{manifest.lastSeq}</TableCell>
                      <TableCell className="font-mono text-xs" title={manifest.exportHash}>{manifest.exportHash.slice(0, 14)}…</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
