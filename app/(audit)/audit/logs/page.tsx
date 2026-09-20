'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { auditApi, type AuditListQuery, type AuditLogEntry } from '@/lib/audit';
import { formatIdentifierLabel } from '@/lib/format-identifier-label';

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
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; checked: number; firstBadSeq?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [unmask, setUnmask] = useState(false);
  const [confirmUnmask, setConfirmUnmask] = useState(false);
  // Sensitive and masked reads can overlap while filters, pagination, or the disclosure mode
  // changes. Only the newest request may publish data; otherwise a late clear-text response could
  // overwrite a newer masked view.
  const listRequestGeneration = useRef(0);
  const categoryOptions = [{ value: ANY, label: t('allCategories') }, ...CATEGORIES.map((category) => ({ value: category, label: formatIdentifierLabel(category) }))];
  const searchEntityId = /^[a-f0-9]{24}$/i.test(search.trim()) ? search.trim() : '';
  const isLoadedPageFilter = Boolean(search.trim()) && !searchEntityId;

  const load = useCallback(
    (cursorSeq: number | null) => {
      const generation = ++listRequestGeneration.current;
      setLoading(true);
      const q: AuditListQuery = { limit: 50 };
      if (category !== ANY) q.category = category as AuditListQuery['category'];
      if (searchEntityId) q.entityId = searchEntityId;
      if (cursorSeq) q.cursorSeq = cursorSeq;
      if (unmask) q.unmask = 'true';
      auditApi
        .list(q)
        .then((r) => {
          if (generation !== listRequestGeneration.current) return;
          setItems(r.items);
          setNext(r.nextCursorSeq);
          setError(null);
        })
        .catch((e) => {
          if (generation === listRequestGeneration.current) setError(toApiError(e).message);
        })
        .finally(() => {
          if (generation === listRequestGeneration.current) setLoading(false);
        });
    },
    [category, searchEntityId, unmask],
  );
  useEffect(() => {
    load(cursor);
    return () => {
      listRequestGeneration.current += 1;
    };
  }, [load, cursor]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query || /^[a-f0-9]{24}$/i.test(query)) return items;
    return items.filter((entry) => [entry.actorRole, entry.actorUserId, entry.action, entry.category, entry.entity.type, entry.entity.id]
      .some((value) => value?.toLowerCase().includes(query)));
  }, [items, search]);

  function showSensitivePayloads() {
    listRequestGeneration.current += 1;
    setConfirmUnmask(false);
    setExpanded(null);
    setItems([]);
    setNext(null);
    setCursor(null);
    setError(null);
    setUnmask(true);
  }

  function returnToMaskedView() {
    listRequestGeneration.current += 1;
    setConfirmUnmask(false);
    setExpanded(null);
    // Clear clear-text payloads synchronously; the next render refetches the same view masked.
    setItems([]);
    setNext(null);
    setCursor(null);
    setError(null);
    setUnmask(false);
  }

  return (
    <div className="page-shell">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['FR-24–26', 'SEC-07']}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5"><ShieldCheck className="size-3.5" aria-hidden="true" />{t('readOnlyBadge')}</Badge>
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
        }
      />
      <div
        className={`flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${
          unmask ? 'border-amber-300 bg-amber-50/80 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100' : 'border-blue-200 bg-blue-50/65 text-blue-950 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-100'
        }`}
        role="status"
      >
        <div className="flex items-start gap-3">
          {unmask
            ? <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            : <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-700 dark:text-blue-300" aria-hidden="true" />}
          <div>
            <p className="font-semibold">{unmask ? t('unmask.visibleTitle') : t('unmask.maskedTitle')}</p>
            <p className={`mt-1 text-xs leading-5 ${unmask ? 'text-amber-900/80 dark:text-amber-100/80' : 'text-blue-900/75 dark:text-blue-100/75'}`}>
              {unmask ? t('unmask.visibleDescription') : t('unmask.maskedDescription')}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={unmask ? 'default' : 'outline'}
          className="shrink-0 self-start sm:self-auto"
          disabled={loading}
          onClick={() => unmask ? returnToMaskedView() : setConfirmUnmask(true)}
        >
          {unmask ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {unmask ? t('unmask.returnMasked') : t('unmask.show')}
        </Button>
      </div>
      <div className="control-strip grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">{t('filters.category')}</Label>
          <Select items={categoryOptions} value={category} onValueChange={(v) => { setCategory(v ?? ANY); setCursor(null); }}>
            <SelectTrigger size="sm" className="w-full" aria-label={t('filters.category')}>
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
          <Label htmlFor="audit-search" className="text-xs">
            {t('filters.search')}
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="audit-search" className="h-9 w-full rounded-lg border border-input bg-transparent pl-8 pr-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={search} onChange={(e) => { setSearch(e.target.value); setCursor(null); }} placeholder={t('filters.searchPlaceholder')} />
          </div>
          <p className="text-[0.7rem] leading-5 text-muted-foreground">{t('filters.searchScope')}</p>
        </div>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div>}
      <div className="data-panel divide-y lg:hidden">
        {loading && <p className="p-8 text-center text-sm text-muted-foreground">{t('loading')}</p>}
        {!loading && visibleItems.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{isLoadedPageFilter ? t('emptyPageFilter') : t('empty')}</p>}
        {!loading && visibleItems.map((entry) => (
          <article key={entry._id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{entry.action}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString(locale)}</p>
              </div>
              <Badge variant="secondary">{formatIdentifierLabel(entry.category)}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-muted-foreground">{t('columns.sequence')}</dt><dd className="mt-0.5 font-mono">{entry.seq}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.size')}</dt><dd className="mt-0.5 font-mono">{formatBytes(eventSize(entry), locale)}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.user')}</dt><dd className="mt-0.5">{entry.actorRole ? formatIdentifierLabel(entry.actorRole) : t('systemActor')}</dd></div>
              <div><dt className="text-muted-foreground">{t('columns.record')}</dt><dd className="mt-0.5 font-mono">{formatIdentifierLabel(entry.entity.type)} {entry.entity.id.slice(-6)}</dd></div>
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
      <div className="data-panel hidden lg:flex">
        <Table containerLabel={t('title')}>
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
            {!loading && visibleItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">{isLoadedPageFilter ? t('emptyPageFilter') : t('empty')}</TableCell>
              </TableRow>
            )}
            {!loading && visibleItems.map((e) => (
              <TableRow key={e._id}>
                <TableCell className="whitespace-nowrap align-top">{new Date(e.createdAt).toLocaleString(locale)}</TableCell>
                <TableCell className="align-top">
                  <p className="whitespace-nowrap text-sm font-medium">{e.actorRole ? formatIdentifierLabel(e.actorRole) : t('systemActor')}</p>
                  {e.actorUserId && <p className="mt-0.5 font-mono text-[0.68rem] text-muted-foreground" title={e.actorUserId}>…{e.actorUserId.slice(-8)}</p>}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-64 items-start justify-between gap-2">
                    <div>
                      <span className="font-medium">{e.action}</span>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary">{formatIdentifierLabel(e.category)}</Badge>
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
                  <p className="font-medium">{formatIdentifierLabel(e.entity.type)}</p>
                  <p className="mt-0.5 font-mono text-muted-foreground" title={e.entity.id}>…{e.entity.id.slice(-8)}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right align-top font-mono text-xs tabular-nums" title={t('columns.sizeHint')}>{formatBytes(eventSize(e), locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-xs text-muted-foreground">{t('visibleCount', { count: visibleItems.length })}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={cursor === null} onClick={() => setCursor(null)}>
            {t('newest')}
          </Button>
          <Button size="sm" variant="outline" disabled={next === null} onClick={() => setCursor(next)}>
            {t('older')}
          </Button>
        </div>
      </div>
      <p className="rounded-xl border border-blue-200 bg-blue-50/55 p-4 text-xs leading-5 text-blue-950/75 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-100/85">{t('note')}</p>

      <Dialog open={confirmUnmask} onOpenChange={setConfirmUnmask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('unmask.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('unmask.confirmDescription')}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-300 bg-amber-50/75 p-3 text-xs leading-5 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
            {t('unmask.auditNotice')}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnmask(false)}>{t('unmask.cancel')}</Button>
            <Button onClick={showSensitivePayloads}><Eye aria-hidden="true" />{t('unmask.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
