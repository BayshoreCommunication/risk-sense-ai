'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { EntityApi, Item } from '@/lib/admin/content';
import { toApiError } from '@/lib/api/client';

/**
 * Generic Administrator CRUD screen (DASH-02, NFR-08 "no code deploy"). Driven by a field spec so
 * personas, scenarios and questions share one implementation. Complex nested values (flows, options,
 * actions) are edited as JSON for now — dedicated editors come with T-027's second pass.
 */
export type FieldSpec =
  | { name: string; label: string; kind: 'text' | 'textarea' | 'number' | 'boolean'; required?: boolean; help?: string; immutable?: boolean }
  | { name: string; label: string; kind: 'select'; options: string[]; required?: boolean; help?: string; immutable?: boolean }
  | { name: string; label: string; kind: 'list'; required?: boolean; help?: string } // semicolon-separated → string[]
  | { name: string; label: string; kind: 'json'; required?: boolean; help?: string; example?: unknown }; // nested object/array

export interface ContentManagerProps {
  title: string;
  description: string;
  entity: 'persona' | 'scenario' | 'question';
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
    else if (f.kind === 'boolean') out[f.name] = v === undefined ? 'true' : String(v);
    else out[f.name] = v === undefined || v === null ? '' : String(v);
  }
  return out;
}

function fromFormValues(values: Record<string, string>, fields: FieldSpec[], editing: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if (editing && 'immutable' in f && f.immutable) continue;
    const raw = values[f.name] ?? '';
    let v: unknown;
    if (f.kind === 'list') v = raw.split(';').map((s) => s.trim()).filter(Boolean);
    else if (f.kind === 'json') {
      if (!raw.trim()) continue;
      try {
        v = JSON.parse(raw);
      } catch {
        throw new Error(`${f.label}: invalid JSON`);
      }
    } else if (f.kind === 'number') {
      if (raw === '') continue;
      v = Number(raw);
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

export function ContentManager(props: ContentManagerProps) {
  const { title, description, apiClient, fields, columns, versioned, defaultQuery, approval } = props;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState('');

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
    setOpen(true);
  }
  function openEdit(item: Item) {
    setEditing(item);
    setValues(toFormValues(item, fields));
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
    setError(null);
    try {
      const body = fromFormValues(values, fields, Boolean(editing));
      if (editing) await apiClient.update(editing._id, body);
      else await apiClient.create(body);
      setOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error && !(e as { code?: string }).code ? e.message : toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48" />
          <Button onClick={openCreate}>New</Button>
        </div>
      </div>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{error}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              {versioned && <TableHead>Version</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={columns.length + 3} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 3} className="text-center text-muted-foreground">
                  Nothing yet. Click New, or upload a dataset (T-024).
                </TableCell>
              </TableRow>
            )}
            {visible.map((item) => (
              <TableRow key={item._id}>
                {columns.map((c) => (
                  <TableCell key={c.key}>{c.render ? c.render(item) : String(getPath(item, c.key) ?? '')}</TableCell>
                ))}
                {versioned && (
                  <TableCell>
                    v{String(item.version ?? 1)}
                    {item.isCurrent ? <span className="ml-1 text-xs text-muted-foreground">(current)</span> : null}
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'}>{item.status}</Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  {item.status !== 'retired' && item.status !== 'deactivated' && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                  )}
                  {approval && item.status === 'draft' && !item.approvedBy && apiClient.approve && (
                    <Button size="sm" variant="secondary" onClick={() => void act(() => apiClient.approve!(item._id))}>
                      Approve
                    </Button>
                  )}
                  {apiClient.activate && (item.status === 'approved' || (item.status === 'draft' && (!approval || Boolean(item.approvedBy)))) && (
                    <Button size="sm" onClick={() => void act(() => apiClient.activate!(item._id))}>
                      Activate
                    </Button>
                  )}
                  {versioned && item.status === 'active' && apiClient.deactivate && (
                    <Button size="sm" variant="destructive" onClick={() => void act(() => apiClient.deactivate!(item._id))}>
                      Deactivate
                    </Button>
                  )}
                  {!versioned && (item.status === 'active' || item.status === 'approved') && apiClient.retire && (
                    <Button size="sm" variant="destructive" onClick={() => void act(() => apiClient.retire!(item._id))}>
                      Retire
                    </Button>
                  )}
                  {versioned && apiClient.history && (
                    <Button size="sm" variant="ghost" onClick={() => void act(async () => setHistory(await apiClient.history!(item._id)))}>
                      History
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${props.entity} (v${String(editing.version ?? 1)}, ${editing.status})` : `New ${props.entity}`}</DialogTitle>
            <DialogDescription>
              {editing && versioned && editing.status === 'active'
                ? 'This version is active and will not be modified: saving creates a new draft version.'
                : 'Lists use ; as separator. Nested values are JSON.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {fields.map((f) => {
              const disabled = Boolean(editing && 'immutable' in f && f.immutable);
              const common = { id: f.name, disabled };
              return (
                <div key={f.name} className="space-y-1">
                  <Label htmlFor={f.name}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </Label>
                  {f.kind === 'textarea' || f.kind === 'list' || f.kind === 'json' ? (
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
                        <SelectValue placeholder="Select…" />
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
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input {...common} type={f.kind === 'number' ? 'number' : 'text'} value={values[f.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
                  )}
                  {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={history !== null} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>Older versions stay readable because assessments pin them (AI-04).</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {(history ?? []).map((h) => (
              <li key={h._id} className="flex items-center justify-between rounded border px-2 py-1">
                <span>
                  v{String(h.version)} · {String(h.name ?? h.key)}
                </span>
                <Badge variant={STATUS_VARIANT[h.status] ?? 'secondary'}>{h.status}</Badge>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
