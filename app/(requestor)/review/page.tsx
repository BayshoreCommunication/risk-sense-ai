'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';
import { assessments, type AssessmentCounts, type AssessmentListItem, type AssessmentListQuery, type Department } from '@/lib/assessments';

const CLASS_LABEL: Record<string, string> = { monitor_only: 'Monitor Only', risk: 'Risk', elevated_risk: 'Elevated Risk', issue: 'Issue' };
const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  intake_complete: 'Ready to submit',
  awaiting_decision: 'Awaiting decision',
  escalated: 'Escalated',
  closed: 'Closed',
  error_review: 'Error review',
};
const PENDING = new Set(['awaiting_decision', 'escalated', 'error_review']);
const TABS: { key: keyof AssessmentCounts; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'awaiting_decision', label: STATUS_LABEL.awaiting_decision! },
  { key: 'escalated', label: STATUS_LABEL.escalated! },
  { key: 'error_review', label: STATUS_LABEL.error_review! },
  { key: 'in_progress', label: STATUS_LABEL.in_progress! },
  { key: 'closed', label: STATUS_LABEL.closed! },
];
const PAGE_SIZES = ['10', '25', '50', '100'];
const ANY = '__any';
type Option = { value: string; label: string };
const CLASS_OPTIONS: Option[] = [{ value: ANY, label: 'Any classification' }, ...Object.entries(CLASS_LABEL).map(([value, label]) => ({ value, label }))];
const SORT_OPTIONS: Option[] = [
  { value: 'pending_first', label: 'Pending first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];
const PAGE_SIZE_OPTIONS: Option[] = PAGE_SIZES.map((n) => ({ value: n, label: n }));

type Filters = {
  tab: keyof AssessmentCounts;
  classification: string;
  personaKey: string;
  departmentId: string;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  sort: 'pending_first' | 'newest' | 'oldest';
  limit: number;
  page: number;
};

function readFilters(sp: URLSearchParams): Filters {
  const sort = sp.get('sort');
  const limit = Number(sp.get('limit'));
  return {
    tab: (TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'all') as keyof AssessmentCounts,
    classification: sp.get('classification') ?? '',
    personaKey: sp.get('personaKey') ?? '',
    departmentId: sp.get('departmentId') ?? '',
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    sort: sort === 'newest' || sort === 'oldest' ? sort : 'pending_first',
    limit: PAGE_SIZES.includes(String(limit)) ? limit : 25,
    page: Math.max(1, Number(sp.get('page')) || 1),
  };
}

/** Filters → API query. Dates are local-day inclusive: `to` covers the whole selected day. */
function toQuery(f: Filters): AssessmentListQuery {
  const q: AssessmentListQuery = { sort: f.sort, limit: f.limit, page: f.page };
  if (f.tab === 'pending') q.pending = 'true';
  else if (f.tab !== 'all') q.status = f.tab as AssessmentListQuery['status'];
  if (f.classification) q.classification = f.classification as AssessmentListQuery['classification'];
  if (f.personaKey) q.personaKey = f.personaKey;
  if (f.departmentId) q.departmentId = f.departmentId;
  if (f.from) q.from = new Date(`${f.from}T00:00:00`).toISOString();
  if (f.to) q.to = new Date(`${f.to}T23:59:59.999`).toISOString();
  return q;
}

/**
 * DASH-01 review dashboard: pending / in-progress / closed with class, confidence, explanation and action;
 * filters by persona, department, date (+ status, classification); paginated; pending decisions first.
 * Scope is enforced by the backend (own, or own + department on PAID tenants — DASH-04); the URL carries the
 * filter state so a filtered view can be bookmarked or shared with a colleague in the same department.
 */
function ReviewDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => readFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const [items, setItems] = useState<AssessmentListItem[]>([]);
  const [counts, setCounts] = useState<AssessmentCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<{ key: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reviewer, setReviewer] = useState(false); // PAID reviewDashboard → show requestor/department columns

  useEffect(() => {
    assessments.personas().then(setPersonas).catch(() => setPersonas([]));
    assessments.departments().then(setDepartments).catch(() => setDepartments([]));
    api.GET('/me').then((r) => {
      const me = r.data?.data as { user: { departmentIds: string[]; crossDepartmentAccess: boolean }; tenant: { features: { reviewDashboard: boolean } } } | undefined;
      setReviewer(Boolean(me?.tenant.features.reviewDashboard && (me.user.departmentIds.length || me.user.crossDepartmentAccess)));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    assessments
      .list(toQuery(filters))
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setCounts(r.counts);
        setTotal(r.total);
        setPages(r.pages);
        setError(null);
      })
      .catch((e) => !cancelled && setError(toApiError(e).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  /** Writes the next filter state to the URL; any change other than the page itself resets to page 1. */
  const update = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch, ...(patch.page === undefined ? { page: 1 } : {}) };
      const sp = new URLSearchParams();
      if (next.tab !== 'all') sp.set('tab', next.tab);
      if (next.classification) sp.set('classification', next.classification);
      if (next.personaKey) sp.set('personaKey', next.personaKey);
      if (next.departmentId) sp.set('departmentId', next.departmentId);
      if (next.from) sp.set('from', next.from);
      if (next.to) sp.set('to', next.to);
      if (next.sort !== 'pending_first') sp.set('sort', next.sort);
      if (next.limit !== 25) sp.set('limit', String(next.limit));
      if (next.page > 1) sp.set('page', String(next.page));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [filters, pathname, router],
  );

  const personaOptions = useMemo<Option[]>(() => [{ value: ANY, label: 'Any persona' }, ...personas.map((p) => ({ value: p.key, label: p.name }))], [personas]);
  const departmentOptions = useMemo<Option[]>(() => [{ value: ANY, label: 'Any department' }, ...departments.map((d) => ({ value: d._id, label: d.name }))], [departments]);
  const hasFilters = Boolean(filters.classification || filters.personaKey || filters.departmentId || filters.from || filters.to);
  const personaName = (key?: string) => personas.find((p) => p.key === key)?.name ?? key?.replace(/_/g, ' ') ?? '—';
  const first = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const last = Math.min(total, filters.page * filters.limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Assessments</h1>
          <p className="text-sm text-muted-foreground">
            {reviewer ? 'Your assessments and those of your department. ' : 'Your assessments. '}
            Pending decisions come first — open one to review the recommendation and record your decision.
          </p>
        </div>
        <Button onClick={() => router.push('/chat')}>New assessment</Button>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-2" role="tablist" aria-label="Status">
        {TABS.map((t) => {
          const n = counts ? counts[t.key] : undefined;
          return (
            <Button key={t.key} role="tab" aria-selected={filters.tab === t.key} size="sm" variant={filters.tab === t.key ? 'default' : 'ghost'} onClick={() => update({ tab: t.key })}>
              {t.label}
              {n !== undefined && <span className="ml-1.5 rounded-full bg-background/60 px-1.5 text-xs tabular-nums text-inherit">{n}</span>}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1">
          <Label className="text-xs">Persona</Label>
          <Select items={personaOptions} value={filters.personaKey || ANY} onValueChange={(v) => update({ personaKey: v && v !== ANY ? v : '' })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              {personaOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {departments.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <Select items={departmentOptions} value={filters.departmentId || ANY} onValueChange={(v) => update({ departmentId: v && v !== ANY ? v : '' })}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                {departmentOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Classification</Label>
          <Select items={CLASS_OPTIONS} value={filters.classification || ANY} onValueChange={(v) => update({ classification: v && v !== ANY ? v : '' })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              {CLASS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs">
            From
          </Label>
          <Input id="from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs">
            To
          </Label>
          <Input id="to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sort</Label>
          <Select items={SORT_OPTIONS} value={filters.sort} onValueChange={(v) => update({ sort: (v as Filters['sort']) ?? 'pending_first' })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <div className="sm:col-span-2 md:col-span-3 xl:col-span-6">
            <Button size="sm" variant="link" className="h-auto p-0" onClick={() => update({ classification: '', personaKey: '', departmentId: '', from: '', to: '' })}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              {reviewer && <TableHead>Requestor</TableHead>}
              {reviewer && <TableHead>Department</TableHead>}
              <TableHead>Persona / scenario</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Recommended action</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={reviewer ? 10 : 8} className="text-center text-muted-foreground">
                  {hasFilters || filters.tab !== 'all' ? 'No assessments match these filters.' : 'No assessments yet.'}
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a._id} className={PENDING.has(a.status) ? 'bg-primary/5' : undefined}>
                <TableCell className="whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</TableCell>
                {reviewer && <TableCell className="whitespace-nowrap">{a.requestor?.name ?? '—'}</TableCell>}
                {reviewer && <TableCell className="whitespace-nowrap">{a.department?.name ?? '—'}</TableCell>}
                <TableCell>
                  <div className="text-sm">{personaName(a.personaKey)}</div>
                  <div className="text-xs text-muted-foreground">{a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={PENDING.has(a.status) ? 'default' : 'secondary'}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                </TableCell>
                <TableCell>
                  {a.result ? (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {CLASS_LABEL[a.result.classification] ?? a.result.classification}
                      {a.result.ruleDriven && (
                        <Badge variant="outline" title="A hard rule set this classification (FR-17)">
                          rule-driven
                        </Badge>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {a.result ? (
                    <span title={a.result.professionalConsult ? 'Below 60 %: Professional Consult recommended (FR-20)' : undefined}>
                      {a.result.confidence}%{a.result.professionalConsult ? ' ⚠' : ''}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  {a.result ? (
                    <span title={a.result.explanation} className="block truncate">
                      {a.result.recommendedAction}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {a.decision ? `${a.decision.type}${a.decision.overriddenTo ? ` → ${CLASS_LABEL[a.decision.overriddenTo] ?? a.decision.overriddenTo}` : ''}` : '—'}
                  {a.status === 'escalated' && a.escalatedTo && <div className="text-xs text-muted-foreground">to {a.escalatedTo.name}</div>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => router.push(`/chat/${a._id}`)}>
                    {PENDING.has(a.status) ? 'Review' : 'Open'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div>
          {loading ? 'Loading…' : total === 0 ? '0 assessments' : `${first}–${last} of ${total}`}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Per page</Label>
          <Select items={PAGE_SIZE_OPTIONS} value={String(filters.limit)} onValueChange={(v) => update({ limit: Number(v ?? 25) })}>
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={filters.page <= 1 || loading} onClick={() => update({ page: filters.page - 1 })}>
            Previous
          </Button>
          <span className="tabular-nums">
            Page {filters.page} of {pages}
          </span>
          <Button size="sm" variant="outline" disabled={filters.page >= pages || loading} onClick={() => update({ page: filters.page + 1 })}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewDashboard />
    </Suspense>
  );
}
