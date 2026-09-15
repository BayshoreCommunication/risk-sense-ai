'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, ChevronUp, Fingerprint, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { auditApi, type AuditListQuery, type AuditLogEntry } from '@/lib/audit';

const ANY = '__any';
const CATEGORIES = ['auth', 'session', 'config', 'dataset', 'assessment', 'decision', 'retention', 'access'];

function eventSize(entry: AuditLogEntry) {
  return new TextEncoder().encode(JSON.stringify(entry)).byteLength;
}

function formatBytes(value: number, locale: string) {
  if (value < 1024) return `${value.toLocaleString(locale)} B`;
  return `${(value / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`;
}

/** SEC-07: read-only, hash-chained audit log with the chain verification. Newest first, cursor-paged by seq. */
export default function AuditLogsPage() {
  const locale = useLocale();
  const t = useTranslations('audit.logs');
  const [category, setCategory] = useState(ANY);
  const [entityId, setEntityId] = useState('');
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; checked: number; firstBadSeq?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const categoryOptions = [{ value: ANY, label: t('allCategories') }, ...CATEGORIES.map((category) => ({ value: category, label: category }))];

  const load = useCallback(
    (cursorSeq: number | null) => {
      setLoading(true);
      const q: AuditListQuery = { limit: 50 };
      if (category !== ANY) q.category = category as AuditListQuery['category'];
      if (entityId.trim()) q.entityId = entityId.trim();
      if (cursorSeq) q.cursorSeq = cursorSeq;
      auditApi
        .list(q)
        .then((r) => {
          setItems(r.items);
          setNext(r.nextCursorSeq);
          setError(null);
        })
        .catch((e) => setError(toApiError(e).message))
        .finally(() => setLoading(false));
    },
    [category, entityId],
  );
  useEffect(() => load(cursor), [load, cursor]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="relative overflow-hidden rounded-2xl border bg-card px-5 py-6 shadow-sm sm:px-7">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-primary/10 to-transparent" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Fingerprint className="size-4" aria-hidden="true" />
              {t('eyebrow')}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {verify && (
              <Badge variant={verify.ok ? 'outline' : 'destructive'} className="h-8 gap-1.5 px-3">
                {verify.ok ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <ShieldAlert className="size-3.5" aria-hidden="true" />}
                {verify.ok ? t('verification.intact', { count: verify.checked }) : t('verification.broken', { sequence: verify.firstBadSeq ?? '', count: verify.checked })}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={verifying}
              onClick={() => {
                setVerifying(true);
                auditApi.verify().then(setVerify).catch((e) => setError(toApiError(e).message)).finally(() => setVerifying(false));
              }}
            >
              <RefreshCw className={verifying ? 'animate-spin' : ''} aria-hidden="true" />
              {t('verify')}
            </Button>
          </div>
        </div>
      </header>
      <div className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">{t('filters.category')}</Label>
          <Select items={categoryOptions} value={category} onValueChange={(v) => { setCategory(v ?? ANY); setCursor(null); }}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="entity" className="text-xs">
            {t('filters.entity')}
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="entity" className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={entityId} onChange={(e) => { setEntityId(e.target.value); setCursor(null); }} placeholder={t('filters.entityPlaceholder')} />
          </div>
        </div>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div>}
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.sequence')}</TableHead>
              <TableHead>{t('columns.when')}</TableHead>
              <TableHead>{t('columns.category')}</TableHead>
              <TableHead>{t('columns.action')}</TableHead>
              <TableHead>{t('columns.actor')}</TableHead>
              <TableHead>{t('columns.entity')}</TableHead>
              <TableHead className="text-right" title={t('columns.sizeHint')}>{t('columns.size')}</TableHead>
              <TableHead>{t('columns.hash')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">{t('empty')}</TableCell>
              </TableRow>
            )}
            {!loading && items.map((e) => (
              <TableRow key={e._id}>
                <TableCell className="font-mono">{e.seq}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(e.createdAt).toLocaleString(locale)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.category}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-48 items-center justify-between gap-2">
                    <span>{e.action}</span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-expanded={expanded === e._id}
                      aria-label={expanded === e._id ? t('details.hide', { action: e.action }) : t('details.show', { action: e.action })}
                      onClick={() => setExpanded(expanded === e._id ? null : e._id)}
                    >
                      {expanded === e._id ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                    </Button>
                  </div>
                  {expanded === e._id && <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(e.payload, null, 2)}</pre>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{e.actorRole ?? 'system'}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {e.entity.type} {e.entity.id.slice(-6)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums" title={t('columns.sizeHint')}>{formatBytes(eventSize(e), locale)}</TableCell>
                <TableCell className="font-mono text-xs" title={t('previousHash', { hash: e.prevHash })}>
                  {e.hash.slice(0, 10)}…
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-xs text-muted-foreground">{t('visibleCount', { count: items.length })}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={cursor === null} onClick={() => setCursor(null)}>
            {t('newest')}
          </Button>
          <Button size="sm" variant="outline" disabled={next === null} onClick={() => setCursor(next)}>
            {t('older')}
          </Button>
        </div>
      </div>
    </div>
  );
}
