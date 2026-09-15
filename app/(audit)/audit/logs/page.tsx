'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { auditApi, type AuditListQuery, type AuditLogEntry } from '@/lib/audit';

const ANY = '__any';
const CATEGORIES = ['auth', 'session', 'config', 'dataset', 'assessment', 'decision', 'retention', 'access'];

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
  const categoryOptions = [{ value: ANY, label: t('allCategories') }, ...CATEGORIES.map((category) => ({ value: category, label: category }))];

  const load = useCallback(
    (cursorSeq: number | null) => {
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
        .catch((e) => setError(toApiError(e).message));
    },
    [category, entityId],
  );
  useEffect(() => load(cursor), [load, cursor]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {verify && (
            <Badge variant={verify.ok ? 'outline' : 'destructive'}>{verify.ok ? t('verification.intact', { count: verify.checked }) : t('verification.broken', { sequence: verify.firstBadSeq ?? '', count: verify.checked })}</Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => auditApi.verify().then(setVerify).catch((e) => setError(toApiError(e).message))}>
            {t('verify')}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('filters.category')}</Label>
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
          <input id="entity" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={entityId} onChange={(e) => { setEntityId(e.target.value); setCursor(null); }} placeholder={t('filters.entityPlaceholder')} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.sequence')}</TableHead>
              <TableHead>{t('columns.when')}</TableHead>
              <TableHead>{t('columns.category')}</TableHead>
              <TableHead>{t('columns.action')}</TableHead>
              <TableHead>{t('columns.actor')}</TableHead>
              <TableHead>{t('columns.entity')}</TableHead>
              <TableHead>{t('columns.hash')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((e) => (
              <TableRow key={e._id} className="cursor-pointer" onClick={() => setExpanded(expanded === e._id ? null : e._id)}>
                <TableCell className="font-mono">{e.seq}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(e.createdAt).toLocaleString(locale)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.category}</Badge>
                </TableCell>
                <TableCell>
                  <div>{e.action}</div>
                  {expanded === e._id && <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(e.payload, null, 2)}</pre>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{e.actorRole ?? 'system'}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {e.entity.type} {e.entity.id.slice(-6)}
                </TableCell>
                <TableCell className="font-mono text-xs" title={t('previousHash', { hash: e.prevHash })}>
                  {e.hash.slice(0, 10)}…
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2 text-sm">
        <Button size="sm" variant="outline" disabled={cursor === null} onClick={() => setCursor(null)}>
          {t('newest')}
        </Button>
        <Button size="sm" variant="outline" disabled={next === null} onClick={() => setCursor(next)}>
          {t('older')}
        </Button>
      </div>
    </div>
  );
}
