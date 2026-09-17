'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Search, ShieldAlert } from 'lucide-react';
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
    <div className="page-shell">
      <header className="workspace-header">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="page-heading">{t('title')}</h1>
            <p className="page-description mt-2">{t('description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t('scopeBadge')}</Badge>
            <Badge variant="outline">FR-24–26</Badge>
            <Badge variant="outline">SEC-07</Badge>
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
      <div className="control-strip grid gap-3 sm:grid-cols-3">
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
      <div className="data-panel divide-y lg:hidden">
        {loading && <p className="p-8 text-center text-sm text-muted-foreground">{t('loading')}</p>}
        {!loading && items.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('empty')}</p>}
        {!loading && items.map((entry) => (
          <article key={entry._id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{entry.action}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString(locale)}</p>
              </div>
              <Badge variant="secondary">{entry.category}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-muted-foreground">{t('columns.sequence')}</dt><dd className="mt-0.5 font-mono">{entry.seq}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.size')}</dt><dd className="mt-0.5 font-mono">{formatBytes(eventSize(entry), locale)}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.user')}</dt><dd className="mt-0.5">{entry.actorRole ?? t('systemActor')}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.record')}</dt><dd className="mt-0.5 font-mono">{entry.entity.type} {entry.entity.id.slice(-6)}</dd></div>
              <div className="col-span-2 min-w-0"><dt className="text-muted-foreground">{t('columns.hash')}</dt><dd className="mt-0.5 truncate font-mono" title={entry.hash}>{entry.hash}</dd></div>
            </dl>
            <Button size="sm" variant="outline" className="w-full" aria-expanded={expanded === entry._id} onClick={() => setExpanded(expanded === entry._id ? null : entry._id)}>
              {expanded === entry._id ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
              {expanded === entry._id ? t('details.hide', { action: entry.action }) : t('details.show', { action: entry.action })}
            </Button>
            {expanded === entry._id && <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(entry.payload, null, 2)}</pre>}
          </article>
        ))}
      </div>
      <div className="data-panel hidden overflow-x-auto lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.timestamp')}</TableHead>
              <TableHead>{t('columns.user')}</TableHead>
              <TableHead>{t('columns.action')}</TableHead>
              <TableHead>{t('columns.record')}</TableHead>
              <TableHead className="text-right" title={t('columns.sizeHint')}>{t('columns.size')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">{t('empty')}</TableCell>
              </TableRow>
            )}
            {!loading && items.map((e) => (
              <TableRow key={e._id}>
                <TableCell className="whitespace-nowrap align-top">{new Date(e.createdAt).toLocaleString(locale)}</TableCell>
                <TableCell className="align-top">
                  <p className="whitespace-nowrap text-sm font-medium">{e.actorRole ?? t('systemActor')}</p>
                  {e.actorUserId && <p className="mt-0.5 font-mono text-[0.68rem] text-muted-foreground" title={e.actorUserId}>…{e.actorUserId.slice(-8)}</p>}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-64 items-start justify-between gap-2">
                    <div>
                      <span className="font-medium">{e.action}</span>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary">{e.category}</Badge>
                        <span className="font-mono text-[0.68rem] text-muted-foreground">{t('sequenceValue', { value: e.seq })}</span>
                      </div>
                    </div>
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
                  {expanded === e._id && (
                    <div className="mt-3 max-w-2xl space-y-2 rounded-lg border bg-muted/35 p-3 text-xs">
                      <dl className="grid gap-2 sm:grid-cols-2">
                        <div className="min-w-0"><dt className="text-muted-foreground">{t('columns.hash')}</dt><dd className="truncate font-mono" title={e.hash}>{e.hash}</dd></div>
                        <div className="min-w-0"><dt className="text-muted-foreground">{t('previousHashLabel')}</dt><dd className="truncate font-mono" title={e.prevHash}>{e.prevHash}</dd></div>
                      </dl>
                      <pre className="max-h-72 overflow-auto rounded-md bg-background p-3">{JSON.stringify(e.payload, null, 2)}</pre>
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top text-xs">
                  <p className="font-medium capitalize">{e.entity.type.replace(/_/g, ' ')}</p>
                  <p className="mt-0.5 font-mono text-muted-foreground" title={e.entity.id}>…{e.entity.id.slice(-8)}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right align-top font-mono text-xs tabular-nums" title={t('columns.sizeHint')}>{formatBytes(eventSize(e), locale)}</TableCell>
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
