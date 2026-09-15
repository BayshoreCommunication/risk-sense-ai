'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';
import { assessments, type AssessmentCounts, type AssessmentListItem, type AssessmentListQuery, type Department } from '@/lib/assessments';

const PENDING = new Set(['awaiting_decision', 'escalated', 'error_review']);
const TAB_KEYS: (keyof AssessmentCounts)[] = ['all', 'pending', 'awaiting_decision', 'escalated', 'error_review', 'in_progress', 'closed'];
const PAGE_SIZES = ['10', '25', '50', '100'];
const ANY = '__any';
type Option = { value: string; label: string };
const CLASS_KEYS = ['monitor_only', 'risk', 'elevated_risk', 'issue'] as const;
const SORT_KEYS = ['pending_first', 'newest', 'oldest'] as const;
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
    tab: (TAB_KEYS.find((key) => key === sp.get('tab')) ?? 'all') as keyof AssessmentCounts,
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
  const locale = useLocale();
  const t = useTranslations('reviewDashboard');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
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

  const tabs = TAB_KEYS.map((key) => ({ key, label: t(`tabs.${key}`) }));
  const classOptions: Option[] = [{ value: ANY, label: t('filters.anyClassification') }, ...CLASS_KEYS.map((value) => ({ value, label: classification(value) }))];
  const sortOptions: Option[] = SORT_KEYS.map((value) => ({ value, label: t(`sort.${value}`) }));
  const personaOptions = useMemo<Option[]>(() => [{ value: ANY, label: t('filters.anyPersona') }, ...personas.map((p) => ({ value: p.key, label: p.name }))], [personas, t]);
  const departmentOptions = useMemo<Option[]>(() => [{ value: ANY, label: t('filters.anyDepartment') }, ...departments.map((d) => ({ value: d._id, label: d.name }))], [departments, t]);
  const hasFilters = Boolean(filters.classification || filters.personaKey || filters.departmentId || filters.from || filters.to);
  const personaName = (key?: string) => personas.find((p) => p.key === key)?.name ?? key?.replace(/_/g, ' ') ?? '—';
  const first = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const last = Math.min(total, filters.page * filters.limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{reviewer ? t('descriptionReviewer') : t('descriptionRequestor')}</p>
        </div>
        <Button onClick={() => router.push('/chat')}>{t('newAssessment')}</Button>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-2" role="tablist" aria-label={t('statusTabsLabel')}>
        {tabs.map((tab) => {
          const n = counts ? counts[tab.key] : undefined;
          return (
            <Button key={tab.key} role="tab" aria-selected={filters.tab === tab.key} size="sm" variant={filters.tab === tab.key ? 'default' : 'ghost'} onClick={() => update({ tab: tab.key })}>
              {tab.label}
              {n !== undefined && <span className="ml-1.5 rounded-full bg-background/60 px-1.5 text-xs tabular-nums text-inherit">{n}</span>}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1">
          <Label className="text-xs">{t('filters.persona')}</Label>
          <Select items={personaOptions} value={filters.personaKey || ANY} onValueChange={(v) => update({ personaKey: v && v !== ANY ? v : '' })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder={t('filters.any')} />
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
            <Label className="text-xs">{t('filters.department')}</Label>
            <Select items={departmentOptions} value={filters.departmentId || ANY} onValueChange={(v) => update({ departmentId: v && v !== ANY ? v : '' })}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder={t('filters.any')} />
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
          <Label className="text-xs">{t('filters.classification')}</Label>
          <Select items={classOptions} value={filters.classification || ANY} onValueChange={(v) => update({ classification: v && v !== ANY ? v : '' })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder={t('filters.any')} />
            </SelectTrigger>
            <SelectContent>
              {classOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs">
            {t('filters.from')}
          </Label>
          <Input id="from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs">
            {t('filters.to')}
          </Label>
          <Input id="to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('filters.sort')}</Label>
          <Select items={sortOptions} value={filters.sort} onValueChange={(v) => update({ sort: (v as Filters['sort']) ?? 'pending_first' })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
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
              {t('filters.clear')}
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.started')}</TableHead>
              {reviewer && <TableHead>{t('columns.requestor')}</TableHead>}
              {reviewer && <TableHead>{t('columns.department')}</TableHead>}
              <TableHead>{t('columns.personaScenario')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.classification')}</TableHead>
              <TableHead>{t('columns.confidence')}</TableHead>
              <TableHead>{t('columns.recommendedAction')}</TableHead>
              <TableHead>{t('columns.decision')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={reviewer ? 10 : 8} className="text-center text-muted-foreground">
                  {hasFilters || filters.tab !== 'all' ? t('empty.filtered') : t('empty.default')}
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a._id} className={PENDING.has(a.status) ? 'bg-primary/5' : undefined}>
                <TableCell className="whitespace-nowrap">{new Date(a.createdAt).toLocaleString(locale)}</TableCell>
                {reviewer && <TableCell className="whitespace-nowrap">{a.requestor?.name ?? '—'}</TableCell>}
                {reviewer && <TableCell className="whitespace-nowrap">{a.department?.name ?? '—'}</TableCell>}
                <TableCell>
                  <div className="text-sm">{personaName(a.personaKey)}</div>
                  <div className="text-xs text-muted-foreground">{a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={PENDING.has(a.status) ? 'default' : 'secondary'}>{status.has(a.status) ? status(a.status) : a.status}</Badge>
                </TableCell>
                <TableCell>
                  {a.result ? (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {classification.has(a.result.classification) ? classification(a.result.classification) : a.result.classification}
                      {a.result.ruleDriven && (
                        <Badge variant="outline" title={t('ruleDrivenTitle')}>
                          {t('ruleDriven')}
                        </Badge>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {a.result ? (
                    <span title={a.result.professionalConsult ? t('professionalConsultTitle') : undefined}>
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
                  {a.decision ? `${a.decision.type}${a.decision.overriddenTo ? ` → ${classification.has(a.decision.overriddenTo) ? classification(a.decision.overriddenTo) : a.decision.overriddenTo}` : ''}` : '—'}
                  {a.status === 'escalated' && a.escalatedTo && <div className="text-xs text-muted-foreground">{t('routedTo', { name: a.escalatedTo.name })}</div>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => router.push(`/chat/${a._id}`)}>
                    {PENDING.has(a.status) ? t('actions.review') : t('actions.open')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div>
          {loading ? t('loading') : total === 0 ? t('pagination.zero') : t('pagination.range', { first, last, total })}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">{t('pagination.perPage')}</Label>
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
            {t('pagination.previous')}
          </Button>
          <span className="tabular-nums">
            {t('pagination.page', { page: filters.page, pages })}
          </span>
          <Button size="sm" variant="outline" disabled={filters.page >= pages || loading} onClick={() => update({ page: filters.page + 1 })}>
            {t('pagination.next')}
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
