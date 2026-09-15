'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CalendarClock, CheckCircle2, ChevronRight, Gauge, ClipboardCheck, Filter, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
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
  scenarioKey: string;
  departmentId: string;
  mandatoryReview: '' | 'true' | 'false';
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  sort: 'pending_first' | 'newest' | 'oldest';
  limit: number;
  page: number;
};

function readFilters(sp: URLSearchParams): Filters {
  const sort = sp.get('sort');
  const limit = Number(sp.get('limit'));
  const mandatoryReview = sp.get('mandatoryReview');
  return {
    tab: (TAB_KEYS.find((key) => key === sp.get('tab')) ?? 'all') as keyof AssessmentCounts,
    classification: sp.get('classification') ?? '',
    personaKey: sp.get('personaKey') ?? '',
    scenarioKey: normalizeScenarioKey(sp.get('scenarioKey') ?? ''),
    departmentId: sp.get('departmentId') ?? '',
    mandatoryReview: mandatoryReview === 'true' || mandatoryReview === 'false' ? mandatoryReview : '',
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
  if (f.scenarioKey) q.scenarioKey = f.scenarioKey;
  if (f.departmentId) q.departmentId = f.departmentId;
  if (f.mandatoryReview) q.mandatoryReview = f.mandatoryReview;
  if (f.from) q.from = new Date(`${f.from}T00:00:00`).toISOString();
  if (f.to) q.to = new Date(`${f.to}T23:59:59.999`).toISOString();
  return q;
}

const DAY_MS = 86_400_000;

/** Closed rows stop accumulating at the recorded decision close time. */
function daysOpen(a: AssessmentListItem, now: number) {
  const started = new Date(a.timing.startedAt || a.createdAt).getTime();
  const ended = a.status === 'closed' && a.timing.closedAt ? new Date(a.timing.closedAt).getTime() : now;
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return 0;
  return Math.max(0, Math.floor((ended - started) / DAY_MS));
}

function normalizeScenarioKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 64);
  return normalized.length >= 2 ? normalized : '';
}

function classificationTone(value: string) {
  if (value === 'monitor_only') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (value === 'risk') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (value === 'elevated_risk') return 'border-orange-200 bg-orange-50 text-orange-800';
  if (value === 'issue') return 'border-red-200 bg-red-50 text-red-800';
  return '';
}

/**
 * DASH-01 review dashboard: pending / in-progress / closed with class, confidence, explanation and action;
 * filters by persona, scenario, department, date, mandatory review (+ status, classification); paginated;
 * pending decisions first.
 * Scope is enforced by the backend (own, or own + department on PAID tenants — DASH-04); the URL carries the
 * filter state so a filtered view can be bookmarked or shared with a colleague in the same department.
 */
function ReviewDashboard() {
  const locale = useLocale();
  const t = useTranslations('reviewDashboard');
  const common = useTranslations('common');
  const detail = useTranslations('assessmentDetail');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => readFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const [items, setItems] = useState<AssessmentListItem[]>([]);
  const [counts, setCounts] = useState<AssessmentCounts | null>(null);
  const [averageConfidence, setAverageConfidence] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<{ key: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reviewer, setReviewer] = useState(false); // PAID reviewDashboard → show requestor/department columns
  const [scenarioDraft, setScenarioDraft] = useState(filters.scenarioKey);
  const [requestVersion, setRequestVersion] = useState(0);
  const [dashboardOpenedAt] = useState(() => Date.now());

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
    setError(null);
    assessments
      .list(toQuery(filters))
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setCounts(r.counts);
        setAverageConfidence(r.summary?.averageConfidence ?? null);
        setTotal(r.total);
        setPages(r.pages);
        setError(null);
      })
      .catch((e) => !cancelled && setError(toApiError(e).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, requestVersion]);

  useEffect(() => setScenarioDraft(filters.scenarioKey), [filters.scenarioKey]);

  /** Writes the next filter state to the URL; any change other than the page itself resets to page 1. */
  const update = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch, ...(patch.page === undefined ? { page: 1 } : {}) };
      const sp = new URLSearchParams();
      if (next.tab !== 'all') sp.set('tab', next.tab);
      if (next.classification) sp.set('classification', next.classification);
      if (next.personaKey) sp.set('personaKey', next.personaKey);
      if (next.scenarioKey) sp.set('scenarioKey', next.scenarioKey);
      if (next.departmentId) sp.set('departmentId', next.departmentId);
      if (next.mandatoryReview) sp.set('mandatoryReview', next.mandatoryReview);
      if (next.from) sp.set('from', next.from);
      if (next.to) sp.set('to', next.to);
      if (next.sort !== 'pending_first') sp.set('sort', next.sort);
      if (next.limit !== 25) sp.set('limit', String(next.limit));
      if (next.page > 1) sp.set('page', String(next.page));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  const tabs = TAB_KEYS.map((key) => ({ key, label: t(`tabs.${key}`) }));
  const classOptions: Option[] = [{ value: ANY, label: t('filters.anyClassification') }, ...CLASS_KEYS.map((value) => ({ value, label: classification(value) }))];
  const sortOptions: Option[] = SORT_KEYS.map((value) => ({ value, label: t(`sort.${value}`) }));
  const personaOptions = useMemo<Option[]>(() => [{ value: ANY, label: t('filters.anyPersona') }, ...personas.map((p) => ({ value: p.key, label: p.name }))], [personas, t]);
  const departmentOptions = useMemo<Option[]>(() => [{ value: ANY, label: t('filters.anyDepartment') }, ...departments.map((d) => ({ value: d._id, label: d.name }))], [departments, t]);
  const reviewOptions: Option[] = [
    { value: ANY, label: t('filters.anyReview') },
    { value: 'true', label: t('filters.reviewRequired') },
    { value: 'false', label: t('filters.reviewNotRequired') },
  ];
  const scenarioSuggestions = useMemo(() => Array.from(new Set(items.map((item) => item.scenarioKey).filter((key): key is string => Boolean(key)))).sort(), [items]);
  const hasFilters = Boolean(filters.classification || filters.personaKey || filters.scenarioKey || filters.departmentId || filters.mandatoryReview || filters.from || filters.to);
  const personaName = (key?: string) => personas.find((p) => p.key === key)?.name ?? key?.replace(/_/g, ' ') ?? '—';
  const first = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const last = Math.min(total, filters.page * filters.limit);
  const columnCount = reviewer ? 9 : 7;

  const commitScenario = () => {
    const scenarioKey = normalizeScenarioKey(scenarioDraft);
    setScenarioDraft(scenarioKey);
    if (scenarioKey !== filters.scenarioKey) update({ scenarioKey });
  };

  return (
    <div className="page-shell">
      <section className="workspace-header">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <ClipboardCheck aria-hidden="true" className="size-4" />
              {t('eyebrow')}
            </div>
            <h1 className="page-heading">{t('title')}</h1>
            <p className="page-description mt-1.5">{reviewer ? t('descriptionReviewer') : t('descriptionRequestor')}</p>
          </div>
          <Button className="self-start sm:self-center" onClick={() => router.push('/chat')}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t('newAssessment')}
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('summaryLabel')}>
        <button
          type="button"
          aria-pressed={filters.tab === 'all'}
          onClick={() => update({ tab: 'all' })}
          className={`rounded-xl border bg-card p-4 text-left shadow-[0_10px_28px_rgba(15,35,65,0.04)] transition-colors hover:border-primary/30 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${filters.tab === 'all' ? 'border-primary/35 bg-primary/[0.04] ring-1 ring-primary/10' : ''}`}
        >
          <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            {t('tabs.all')}
            <ClipboardCheck aria-hidden="true" className="size-4 text-primary" />
          </span>
          <span className="mt-3 block text-2xl font-semibold tabular-nums">{counts?.all ?? '—'}</span>
        </button>
        <button
          type="button"
          aria-pressed={filters.tab === 'pending'}
          onClick={() => update({ tab: 'pending' })}
          className={`rounded-xl border bg-card p-4 text-left shadow-[0_10px_28px_rgba(15,35,65,0.04)] transition-colors hover:border-amber-300 hover:bg-amber-50/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${filters.tab === 'pending' ? 'border-amber-300 bg-amber-50/50 ring-1 ring-amber-200' : ''}`}
        >
          <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            {t('tabs.pending')}
            <CalendarClock aria-hidden="true" className="size-4 text-amber-600" />
          </span>
          <span className="mt-3 block text-2xl font-semibold tabular-nums">{counts?.pending ?? '—'}</span>
        </button>
        <div className="rounded-xl border bg-card p-4 text-left shadow-[0_10px_28px_rgba(15,35,65,0.04)]">
          <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            {t('averageConfidence')}
            <Gauge aria-hidden="true" className="size-4 text-sky-600" />
          </span>
          <span className="mt-3 block text-2xl font-semibold tabular-nums">{averageConfidence === null ? '—' : `${averageConfidence.toLocaleString(locale, { maximumFractionDigits: 1 })}%`}</span>
        </div>
        <button
          type="button"
          aria-pressed={filters.tab === 'closed'}
          onClick={() => update({ tab: 'closed' })}
          className={`rounded-xl border bg-card p-4 text-left shadow-[0_10px_28px_rgba(15,35,65,0.04)] transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${filters.tab === 'closed' ? 'border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-200' : ''}`}
        >
          <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            {t('tabs.closed')}
            <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
          </span>
          <span className="mt-3 block text-2xl font-semibold tabular-nums">{counts?.closed ?? '—'}</span>
        </button>
      </section>

      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="px-3 py-3 sm:px-4">
          <div className="flex gap-1 overflow-x-auto" aria-label={t('statusTabsLabel')}>
            {tabs.map((tab) => {
              const n = counts ? counts[tab.key] : undefined;
              return (
                <Button
                  key={tab.key}
                  aria-pressed={filters.tab === tab.key}
                  size="sm"
                  className="shrink-0"
                  variant={filters.tab === tab.key ? 'default' : 'ghost'}
                  onClick={() => update({ tab: tab.key })}
                >
                  {tab.label}
                  {n !== undefined && <span className="ml-1 rounded-full bg-background/70 px-1.5 text-xs tabular-nums text-inherit">{n}</span>}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardContent className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Filter aria-hidden="true" className="size-4 text-primary" />
            {t('filters.title')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('filters.persona')}</Label>
              <Select items={personaOptions} value={filters.personaKey || ANY} onValueChange={(v) => update({ personaKey: v && v !== ANY ? v : '' })}>
                <SelectTrigger size="sm" className="w-full" aria-label={t('filters.persona')}>
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
            <div className="space-y-1.5">
              <Label htmlFor="scenarioKey" className="text-xs">
                {t('filters.scenario')}
              </Label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="scenarioKey"
                  list="review-scenario-options"
                  className="pl-8"
                  maxLength={64}
                  value={scenarioDraft}
                  placeholder={t('filters.anyScenario')}
                  onChange={(event) => setScenarioDraft(event.target.value)}
                  onBlur={commitScenario}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitScenario();
                    }
                  }}
                />
                <datalist id="review-scenario-options">
                  {scenarioSuggestions.map((scenario) => (
                    <option key={scenario} value={scenario} />
                  ))}
                </datalist>
              </div>
            </div>
            {departments.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('filters.department')}</Label>
                <Select items={departmentOptions} value={filters.departmentId || ANY} onValueChange={(v) => update({ departmentId: v && v !== ANY ? v : '' })}>
                  <SelectTrigger size="sm" className="w-full" aria-label={t('filters.department')}>
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
            <div className="space-y-1.5">
              <Label className="text-xs">{t('filters.classification')}</Label>
              <Select items={classOptions} value={filters.classification || ANY} onValueChange={(v) => update({ classification: v && v !== ANY ? v : '' })}>
                <SelectTrigger size="sm" className="w-full" aria-label={t('filters.classification')}>
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
            <div className="space-y-1.5">
              <Label className="text-xs">{t('filters.mandatoryReview')}</Label>
              <Select
                items={reviewOptions}
                value={filters.mandatoryReview || ANY}
                onValueChange={(value) => update({ mandatoryReview: value === 'true' || value === 'false' ? value : '' })}
              >
                <SelectTrigger size="sm" className="w-full" aria-label={t('filters.mandatoryReview')}>
                  <SelectValue placeholder={t('filters.anyReview')} />
                </SelectTrigger>
                <SelectContent>
                  {reviewOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from" className="text-xs">
                {t('filters.from')}
              </Label>
              <Input id="from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs">
                {t('filters.to')}
              </Label>
              <Input id="to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('filters.sort')}</Label>
              <Select items={sortOptions} value={filters.sort} onValueChange={(v) => update({ sort: (v as Filters['sort']) ?? 'pending_first' })}>
                <SelectTrigger size="sm" className="w-full" aria-label={t('filters.sort')}>
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
          </div>
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-auto px-0 text-primary hover:bg-transparent"
              onClick={() => update({ classification: '', personaKey: '', scenarioKey: '', departmentId: '', mandatoryReview: '', from: '', to: '' })}
            >
              {t('filters.clear')}
            </Button>
          )}
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </span>
          <Button size="sm" variant="outline" className="self-start border-destructive/30 text-destructive sm:self-auto" onClick={() => setRequestVersion((value) => value + 1)}>
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            {common('retry')}
          </Button>
        </div>
      )}

      <Card className="gap-0 py-0 shadow-sm">
        <Table aria-busy={loading} className={reviewer ? 'min-w-[1120px]' : 'min-w-[940px]'}>
          <TableHeader className="bg-muted/35">
            <TableRow className="hover:bg-transparent">
              {reviewer && <TableHead>{t('columns.requestor')}</TableHead>}
              {reviewer && <TableHead>{t('columns.department')}</TableHead>}
              <TableHead>{t('columns.personaScenario')}</TableHead>
              <TableHead>{t('columns.classification')}</TableHead>
              <TableHead>{t('columns.confidence')}</TableHead>
              <TableHead className="text-center">{t('columns.daysOpen')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.recommendationDecision')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className={loading && items.length > 0 ? 'opacity-60' : undefined}>
            {loading && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-40">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-3 text-center text-muted-foreground" role="status">
                    <span className="size-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" aria-hidden="true" />
                    {t('loading')}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-52 text-center text-muted-foreground">
                  <ClipboardCheck aria-hidden="true" className="mx-auto mb-3 size-8 text-primary/50" />
                  <p className="font-medium text-foreground">{hasFilters || filters.tab !== 'all' ? t('empty.filtered') : t('empty.default')}</p>
                  {hasFilters && (
                    <Button
                      size="sm"
                      variant="link"
                      className="mt-1"
                      onClick={() => update({ classification: '', personaKey: '', scenarioKey: '', departmentId: '', mandatoryReview: '', from: '', to: '' })}
                    >
                      {t('filters.clear')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a._id} className={PENDING.has(a.status) ? 'border-l-2 border-l-primary bg-primary/[0.035]' : undefined}>
                {reviewer && (
                  <TableCell>
                    <div className="font-medium">{a.requestor?.name ?? '—'}</div>
                    {a.requestor?.email && <div className="mt-0.5 max-w-40 truncate text-xs text-muted-foreground">{a.requestor.email}</div>}
                  </TableCell>
                )}
                {reviewer && <TableCell className="whitespace-nowrap">{a.department?.name ?? '—'}</TableCell>}
                <TableCell className="whitespace-normal">
                  <div className="font-medium capitalize">{a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</div>
                  <div className="mt-0.5 max-w-52 truncate text-xs text-muted-foreground">
                    {personaName(a.personaKey)} · {new Date(a.createdAt).toLocaleDateString(locale)} · {a._id.slice(-6).toUpperCase()}
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {a.result ? (
                    <div className="flex max-w-48 flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={classificationTone(a.result.classification)}>
                        {classification.has(a.result.classification) ? classification(a.result.classification) : a.result.classification}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">{a.result.score}/100</span>
                      {a.result.ruleDriven && (
                        <Badge variant="outline" title={t('ruleDrivenTitle')}>
                          {t('ruleDriven')}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {a.result ? (
                    <div className="min-w-24" title={a.result.professionalConsult ? t('professionalConsultTitle') : undefined}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium tabular-nums">{a.result.confidence}%</span>
                        {a.result.professionalConsult && <AlertCircle aria-hidden="true" className="size-3.5 text-amber-600" />}
                      </div>
                      <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, a.result.confidence))}%` }} />
                      </div>
                      {a.result.mandatoryReview && (
                        <Badge variant="destructive" className="mt-2">
                          {detail('result.mandatoryReview')}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-center text-base font-semibold tabular-nums">{daysOpen(a, dashboardOpenedAt)}</TableCell>
                <TableCell>
                  <Badge variant={PENDING.has(a.status) ? 'default' : 'secondary'}>{status.has(a.status) ? status(a.status) : a.status}</Badge>
                  {a.status === 'escalated' && a.escalatedTo && <div className="mt-1 text-xs text-muted-foreground">{t('routedTo', { name: a.escalatedTo.name })}</div>}
                </TableCell>
                <TableCell className="max-w-[18rem] whitespace-normal">
                  {a.result ? (
                    <div>
                      <p className="line-clamp-2 text-sm font-medium leading-5">{a.result.recommendedAction}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground" title={a.result.explanation}>{a.result.explanation}</p>
                    </div>
                  ) : (
                    '—'
                  )}
                  {a.decision && (
                    <Badge variant="outline" className="mt-2 max-w-full">
                      <span className="truncate">
                        {detail.has(`decision.types.${a.decision.type}`) ? detail(`decision.types.${a.decision.type}`) : a.decision.type}
                        {a.decision.overriddenTo ? ` → ${classification.has(a.decision.overriddenTo) ? classification(a.decision.overriddenTo) : a.decision.overriddenTo}` : ''}
                      </span>
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant={PENDING.has(a.status) ? 'default' : 'outline'} onClick={() => router.push(`/chat/${a._id}`)}>
                    {PENDING.has(a.status) ? t('actions.review') : t('actions.open')}
                    <ChevronRight aria-hidden="true" data-icon="inline-end" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <CardFooter className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div className="text-sm text-muted-foreground" aria-live="polite">
            {loading ? t('loading') : total === 0 ? t('pagination.zero') : t('pagination.range', { first, last, total })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs">{t('pagination.perPage')}</Label>
            <Select items={PAGE_SIZE_OPTIONS} value={String(filters.limit)} onValueChange={(v) => update({ limit: Number(v ?? 25) })}>
              <SelectTrigger size="sm" className="w-20" aria-label={t('pagination.perPage')}>
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
            <span className="px-1 text-sm tabular-nums text-muted-foreground">{t('pagination.page', { page: filters.page, pages })}</span>
            <Button size="sm" variant="outline" disabled={filters.page >= pages || loading} onClick={() => update({ page: filters.page + 1 })}>
              {t('pagination.next')}
            </Button>
          </div>
        </CardFooter>
      </Card>
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
