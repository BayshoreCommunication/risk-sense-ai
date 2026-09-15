'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, CheckCircle2, History, Pencil, Plus, Power, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { StructuredFieldEditor, type StructuredFieldKind, validateStructuredField } from '@/components/admin/StructuredFieldEditor';
import type { EntityApi, Item } from '@/lib/admin/content';
import { toApiError } from '@/lib/api/client';

/**
 * Generic Administrator CRUD screen (DASH-02, NFR-08 "no code deploy"). Driven by a field spec so
 * personas, scenarios and questions share one implementation. Nested domain values use dedicated,
 * validated editors so administrators do not need to write JSON (T-027).
 */
export type FieldSpec =
  | { name: string; label: string; kind: 'text' | 'textarea' | 'number' | 'boolean'; required?: boolean; help?: string; immutable?: boolean }
  | { name: string; label: string; kind: 'select'; options: string[]; required?: boolean; help?: string; immutable?: boolean }
  | { name: string; label: string; kind: 'list'; required?: boolean; help?: string } // semicolon-separated → string[]
  | { name: string; label: string; kind: 'json'; required?: boolean; help?: string; example?: unknown }
  | { name: string; label: string; kind: StructuredFieldKind; required?: boolean; help?: string; defaultValue?: unknown };

export interface ContentManagerProps {
  title: string;
  description: string;
  entity: string;
  apiClient: EntityApi;
  fields: FieldSpec[];
  columns: { key: string; label: string; render?: (item: Item) => React.ReactNode }[];
  versioned: boolean;
  defaultQuery?: Record<string, string>;
  /** Change-controlled entities (rules, matrices): show Approve on drafts and Activate only once approved. */
  approval?: boolean;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  parts.slice(0, -1).forEach((p) => {
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  });
  cur[parts[parts.length - 1]!] = value;
}

function toFormValues(item: Item | null, fields: FieldSpec[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = item ? getPath(item, f.name) : undefined;
    if (f.kind === 'list') out[f.name] = Array.isArray(v) ? (v as string[]).join('; ') : '';
    else if (f.kind === 'json') out[f.name] = v === undefined ? (f.example !== undefined ? JSON.stringify(f.example, null, 2) : '') : JSON.stringify(v, null, 2);
    else if (isStructuredKind(f.kind)) {
      const defaultValue = 'defaultValue' in f ? f.defaultValue : undefined;
      out[f.name] = v === undefined ? (defaultValue === undefined ? '' : JSON.stringify(defaultValue)) : JSON.stringify(v);
    }
    else if (f.kind === 'boolean') out[f.name] = v === undefined ? 'true' : String(v);
    else out[f.name] = v === undefined || v === null ? '' : String(v);
  }
  return out;
}

function isStructuredKind(kind: FieldSpec['kind']): kind is StructuredFieldKind {
  return ['flow', 'actions', 'options', 'branch', 'condition', 'factors', 'thresholds', 'confidence'].includes(kind);
}

function fromFormValues(
  values: Record<string, string>,
  fields: FieldSpec[],
  editing: boolean,
  message: (key: 'required' | 'needsEntry' | 'invalid' | 'mustBeNumber', values: { field: string }) => string,
  structuredMessage: (key: string, values?: Record<string, string | number>) => string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if (editing && 'immutable' in f && f.immutable) continue;
    const raw = values[f.name] ?? '';
    let v: unknown;
    if (f.required && !raw.trim()) throw new Error(message('required', { field: f.label }));
    if (f.kind === 'list') {
      const list = raw.split(';').map((s) => s.trim()).filter(Boolean);
      if (f.required && list.length === 0) throw new Error(message('needsEntry', { field: f.label }));
      v = list;
    } else if (f.kind === 'json' || isStructuredKind(f.kind)) {
      if (!raw.trim()) continue;
      try {
        v = JSON.parse(raw);
      } catch {
        throw new Error(message('invalid', { field: f.label }));
      }
      if (isStructuredKind(f.kind)) {
        const validationErrors = validateStructuredField(f.kind, v, values, structuredMessage);
        if (validationErrors.length > 0) throw new Error(`${f.label}: ${validationErrors[0]}`);
      }
    } else if (f.kind === 'number') {
      if (raw === '') continue;
      v = Number(raw);
      if (!Number.isFinite(v)) throw new Error(message('mustBeNumber', { field: f.label }));
    } else if (f.kind === 'boolean') v = raw === 'true';
    else {
      if (raw === '' && !f.required) continue;
      v = raw;
    }
    setPath(body, f.name, v);
  }
  return body;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  approved: 'secondary',
  draft: 'secondary',
  deactivated: 'outline',
  retired: 'outline',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  approved: 'border-sky-200 bg-sky-50 text-sky-700',
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  deactivated: 'border-slate-200 bg-slate-50 text-slate-600',
  retired: 'border-slate-200 bg-slate-50 text-slate-600',
};

type LifecycleAction = 'approve' | 'activate' | 'deactivate' | 'retire';
type PendingAction = { action: LifecycleAction; item: Item; run: (changeRef?: string) => Promise<unknown> };

export function ContentManager(props: ContentManagerProps) {
  const t = useTranslations('contentManager');
  const statusT = useTranslations('status');
  const structuredValidation = useTranslations('structured.validation');
  const { title, description, apiClient, fields, columns, versioned, defaultQuery, approval } = props;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [history, setHistory] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [changeRef, setChangeRef] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiClient.list(defaultQuery));
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [apiClient, defaultQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => JSON.stringify(it).toLowerCase().includes(q));
  }, [items, filter]);

  function openCreate() {
    setEditing(null);
    setValues(toFormValues(null, fields));
    setFormError(null);
    setOpen(true);
  }
  function openEdit(item: Item) {
    setEditing(item);
    setValues(toFormValues(item, fields));
    setFormError(null);
    setOpen(true);
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(toApiError(e).message);
    }
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const body = fromFormValues(
        values,
        fields,
        Boolean(editing),
        (key, interpolation) => t(`validation.${key}`, interpolation),
        (key, interpolation) => structuredValidation(key, interpolation),
      );
      if (editing) await apiClient.update(editing._id, body);
      else await apiClient.create(body);
      setOpen(false);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error && !(e as { code?: string }).code ? e.message : toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;
    const selected = pendingAction;
    if (selected.action === 'approve' && !changeRef.trim()) {
      setActionError(t('confirm.changeRefRequired'));
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setError(null);
    try {
      await selected.run(selected.action === 'approve' ? changeRef.trim() : undefined);
      await reload();
      setPendingAction(null);
      setChangeRef('');
    } catch (e) {
      setActionError(toApiError(e).message);
    } finally {
      setActionBusy(false);
    }
  }

  function askForConfirmation(action: LifecycleAction, item: Item, run: (changeRef?: string) => Promise<unknown>) {
    setChangeRef('');
    setActionError(null);
    setPendingAction({ action, item, run });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 px-5 py-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-3xl">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative min-w-0 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input aria-label={t('filter')} placeholder={t('filterPlaceholder')} value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full pl-8" />
          </div>
          <Button onClick={openCreate} className="shadow-sm">
            <Plus data-icon="inline-start" aria-hidden="true" />
            {t('actions.new')}
          </Button>
        </div>
      </header>

      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{error}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm" aria-busy={loading}>
        <Table className="min-w-[760px]">
          <TableHeader className="bg-muted/45">
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              {versioned ? <TableHead>{t('version')}</TableHead> : null}
              <TableHead>{t('status')}</TableHead>
              <TableHead className="text-right">{t('actions.label')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={columns.length + (versioned ? 3 : 2)} className="h-32 text-center text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            )}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + (versioned ? 3 : 2)} className="h-32 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {visible.map((item) => (
              <TableRow key={item._id} className="group/row">
                {columns.map((c) => (
                  <TableCell key={c.key} className="max-w-72 whitespace-normal leading-5">
                    {c.render ? c.render(item) : String(getPath(item, c.key) ?? '')}
                  </TableCell>
                ))}
                {versioned && (
                  <TableCell className="tabular-nums">
                    <span className="font-medium">v{String(item.version ?? 1)}</span>
                    {item.isCurrent ? <span className="ml-1.5 text-xs text-muted-foreground">({t('current')})</span> : null}
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'} className={STATUS_CLASS[item.status]}>
                    {statusT.has(item.status) ? statusT(item.status) : item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-max flex-wrap justify-end gap-1.5">
                  {item.status !== 'retired' && item.status !== 'deactivated' && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                      <Pencil data-icon="inline-start" aria-hidden="true" />
                      {t('actions.edit')}
                    </Button>
                  )}
                  {approval && item.status === 'draft' && !item.approvedBy && apiClient.approve && (
                    <Button size="sm" variant="secondary" onClick={() => askForConfirmation('approve', item, (reference) => apiClient.approve!(item._id, reference ?? ''))}>
                      <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                      {t('actions.approve')}
                    </Button>
                  )}
                  {apiClient.activate && (item.status === 'approved' || (item.status === 'draft' && (!approval || Boolean(item.approvedBy)))) && (
                    <Button size="sm" onClick={() => askForConfirmation('activate', item, () => apiClient.activate!(item._id))}>
                      <Power data-icon="inline-start" aria-hidden="true" />
                      {t('actions.activate')}
                    </Button>
                  )}
                  {versioned && item.status === 'active' && apiClient.deactivate && (
                    <Button size="sm" variant="destructive" onClick={() => askForConfirmation('deactivate', item, () => apiClient.deactivate!(item._id))}>
                      <Power data-icon="inline-start" aria-hidden="true" />
                      {t('actions.deactivate')}
                    </Button>
                  )}
                  {(item.status === 'active' || item.status === 'approved') && apiClient.retire && (
                    <Button size="sm" variant="destructive" onClick={() => askForConfirmation('retire', item, () => apiClient.retire!(item._id))}>
                      <Archive data-icon="inline-start" aria-hidden="true" />
                      {t('actions.retire')}
                    </Button>
                  )}
                  {versioned && apiClient.history && (
                    <Button size="sm" variant="ghost" onClick={() => void act(async () => setHistory(await apiClient.history!(item._id)))}>
                      <History data-icon="inline-start" aria-hidden="true" />
                      {t('actions.history')}
                    </Button>
                  )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(72rem,calc(100vw-3rem))]">
          <DialogHeader className="border-b border-border/70 pb-4 pr-8">
            <DialogTitle className="text-xl">
              {editing
                ? t('form.editTitle', { entity: props.entity, version: String(editing.version ?? 1), status: editing.status })
                : t('form.newTitle', { entity: props.entity })}
            </DialogTitle>
            <DialogDescription>
              {editing && versioned && editing.status === 'active'
                ? t('form.activeVersionHelp')
                : t('form.help')}
            </DialogDescription>
          </DialogHeader>
          {formError ? <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{formError}</p> : null}
          <div className="grid gap-4 py-1 lg:grid-cols-2">
            {fields.map((f) => {
              const disabled = Boolean(editing && 'immutable' in f && f.immutable);
              const common = { id: f.name, disabled };
              return (
                <div
                  key={f.name}
                  className={isStructuredKind(f.kind) || f.kind === 'textarea' || f.kind === 'list' || f.kind === 'json' ? 'space-y-1.5 lg:col-span-2' : 'space-y-1.5'}
                >
                  <Label htmlFor={f.name}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </Label>
                  {isStructuredKind(f.kind) ? (
                    <StructuredFieldEditor
                      kind={f.kind}
                      value={values[f.name] ?? ''}
                      onChange={(next) => setValues((current) => ({ ...current, [f.name]: next }))}
                    />
                  ) : f.kind === 'textarea' || f.kind === 'list' || f.kind === 'json' ? (
                    <Textarea
                      {...common}
                      rows={f.kind === 'json' ? 6 : 3}
                      className={f.kind === 'json' ? 'font-mono text-xs' : undefined}
                      value={values[f.name] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    />
                  ) : f.kind === 'select' ? (
                    <Select value={values[f.name] ?? ''} onValueChange={(val) => setValues((v) => ({ ...v, [f.name]: val ?? '' }))} disabled={disabled}>
                      <SelectTrigger id={f.name}>
                        <SelectValue placeholder={t('selectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.kind === 'boolean' ? (
                    <Select value={values[f.name] ?? 'true'} onValueChange={(val) => setValues((v) => ({ ...v, [f.name]: val ?? '' }))} disabled={disabled}>
                      <SelectTrigger id={f.name}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">{t('boolean.true')}</SelectItem>
                        <SelectItem value="false">{t('boolean.false')}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input {...common} type={f.kind === 'number' ? 'number' : 'text'} value={values[f.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
                  )}
                  {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? t('actions.saving') : editing ? t('actions.save') : t('actions.createDraft')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingAction !== null} onOpenChange={(nextOpen) => !nextOpen && !actionBusy && setPendingAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction ? t(`confirm.title.${pendingAction.action}`) : ''}</DialogTitle>
            <DialogDescription>
              {pendingAction ? t(`confirm.description.${pendingAction.action}`, { item: String(pendingAction.item.name ?? pendingAction.item.key) }) : ''}
            </DialogDescription>
          </DialogHeader>
          {pendingAction?.action === 'approve' ? (
            <div className="space-y-1">
              <Label htmlFor="change-reference">{t('confirm.changeRef')}</Label>
              <Input
                id="change-reference"
                value={changeRef}
                onChange={(event) => setChangeRef(event.target.value)}
                placeholder={t('confirm.changeRefPlaceholder')}
                disabled={actionBusy}
              />
              <p className="text-xs text-muted-foreground">{t('confirm.changeRefHelp')}</p>
            </div>
          ) : null}
          {actionError ? <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{actionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => setPendingAction(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant={pendingAction?.action === 'deactivate' || pendingAction?.action === 'retire' ? 'destructive' : 'default'}
              disabled={actionBusy}
              onClick={() => void confirmAction()}
            >
              {actionBusy ? t('actions.working') : pendingAction ? t(`confirm.button.${pendingAction.action}`) : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={history !== null} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('history.title')}</DialogTitle>
            <DialogDescription>{t('history.description')}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {(history ?? []).map((h) => (
              <li key={h._id} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                <span>
                  v{String(h.version)} · {String(h.name ?? h.key)}
                </span>
                <Badge variant={STATUS_VARIANT[h.status] ?? 'secondary'} className={STATUS_CLASS[h.status]}>
                  {statusT.has(h.status) ? statusT(h.status) : h.status}
                </Badge>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
