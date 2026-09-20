'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowUpCircle,
  Bell,
  BarChart3,
  Check,
  Clock,
  Eye,
  Scale,
  ShieldHalf,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { matricesApi, type Item } from '@/lib/admin/content';
import { toApiError } from '@/lib/api/client';

/** Factor order and iconography follow docs/design/figma-frames/15-admin-scoring-matrix.png. */
const FACTOR_ORDER = ['controlEffectiveness', 'impact', 'severity', 'likelihood', 'duration', 'regulatorySensitivity'] as const;
type FactorKey = (typeof FACTOR_ORDER)[number];

const FACTOR_ICON: Record<FactorKey, { icon: LucideIcon; className: string }> = {
  controlEffectiveness: { icon: Target, className: 'bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300' },
  impact: { icon: BarChart3, className: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' },
  severity: { icon: AlertTriangle, className: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300' },
  likelihood: { icon: ShieldHalf, className: 'bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300' },
  duration: { icon: Clock, className: 'bg-slate-500/10 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300' },
  regulatorySensitivity: { icon: Scale, className: 'bg-teal-500/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300' },
};

const CLASSIFICATION_ORDER = ['monitor_only', 'risk', 'elevated_risk', 'issue'] as const;
type Classification = (typeof CLASSIFICATION_ORDER)[number];

const CLASSIFICATION_STYLE: Record<Classification, { icon: LucideIcon; tile: string; value: string }> = {
  monitor_only: { icon: Eye, tile: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300', value: 'text-blue-700 dark:text-blue-300' },
  risk: { icon: AlertTriangle, tile: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300', value: 'text-amber-700 dark:text-amber-300' },
  elevated_risk: { icon: ArrowUpCircle, tile: 'bg-orange-500/12 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300', value: 'text-orange-700 dark:text-orange-300' },
  issue: { icon: Bell, tile: 'bg-red-500/10 text-red-600 dark:bg-red-400/15 dark:text-red-300', value: 'text-red-700 dark:text-red-300' },
};

const CONFIDENCE_GATES = ['professionalConsultBelow', 'mandatoryReviewBelow'] as const;
type ConfidenceGate = (typeof CONFIDENCE_GATES)[number];

type Factor = { weight: number; scale: { min: number; max: number }; mapping: unknown[] };
type Range = { min: number; max: number };
type Matrix = Item & {
  name: string;
  sector?: string;
  versionGroupId: string;
  approvedBy?: string | null;
  factors: Record<FactorKey, Factor>;
  thresholds: Record<Classification, Range>;
  confidence?: Partial<Record<ConfidenceGate, number>>;
};

/** One version group: the version that is scoring today, plus the open draft that would replace it. */
type Group = { id: string; name: string; active: Matrix | null; draft: Matrix | null };

type LifecycleAction = 'approve' | 'activate' | 'discard';

function isMatrix(item: Item): item is Matrix {
  return typeof (item as Matrix).factors === 'object' && (item as Matrix).factors !== null;
}

function gateValue(matrix: Matrix, gate: ConfidenceGate) {
  return matrix.confidence?.[gate] ?? (gate === 'professionalConsultBelow' ? 60 : 40);
}

/**
 * Administrator scoring matrix configuration (FR-18, FR-19, FR-20). Weights are edited as percentages
 * that must total 100; thresholds stay contiguous across 0–100.
 *
 * `PATCH /scoring-matrices/{id}` is copy-on-write, so editing the version that is live produces a new
 * draft rather than changing what scores assessments. The draft is shown here with its own approve and
 * activate controls, because a draft that cannot complete that lifecycle from the UI is a change the
 * administrator believes they made and did not (AI-05/AI-06, ISS-033). Editing an existing draft
 * updates it in place.
 */
export function ScoringMatrixEditor() {
  const t = useTranslations('admin.scoring.editor');
  const classificationT = useTranslations('classification');
  const statusT = useTranslations('status');

  const [versions, setVersions] = useState<Matrix[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [gates, setGates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [changeRef, setChangeRef] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // `all` rather than `current`: a draft is not current, and listing only current versions is what made a
  // saved weight change look like it had been discarded.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = (await matricesApi.list({ view: 'all' })).filter(isMatrix);
      setVersions(list);
      setSelectedGroupId((current) => current ?? list[0]?.versionGroupId ?? null);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo<Group[]>(() => {
    const byGroup = new Map<string, Group>();
    for (const version of versions) {
      const group = byGroup.get(version.versionGroupId) ?? { id: version.versionGroupId, name: version.name, active: null, draft: null };
      if (version.status === 'active' && version.isCurrent) group.active = version;
      if (version.status === 'draft' && !group.draft) group.draft = version;
      group.name = group.active?.name ?? version.name;
      byGroup.set(version.versionGroupId, group);
    }
    return [...byGroup.values()].filter((group) => group.active ?? group.draft);
  }, [versions]);

  const group = useMemo(() => groups.find((g) => g.id === selectedGroupId) ?? groups[0] ?? null, [groups, selectedGroupId]);
  // The draft is what an edit changes, so it is what the screen shows; without one, the live version is.
  const editing = group?.draft ?? group?.active ?? null;

  // Reset the form whenever a different group — or a newly saved version of the same group — becomes the target.
  useEffect(() => {
    if (!editing) return;
    setWeights(Object.fromEntries(FACTOR_ORDER.map((key) => [key, editing.factors[key]?.weight ?? 0])));
    setGates(Object.fromEntries(CONFIDENCE_GATES.map((gate) => [gate, gateValue(editing, gate)])));
    setSaved(null);
  }, [editing]);

  const total = FACTOR_ORDER.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
  const balanced = Math.round(total * 100) / 100 === 100;
  const gatesInRange = CONFIDENCE_GATES.every((gate) => Number.isFinite(gates[gate]) && gates[gate]! >= 0 && gates[gate]! <= 100);
  const dirty = Boolean(
    editing &&
      (FACTOR_ORDER.some((key) => (weights[key] ?? 0) !== (editing.factors[key]?.weight ?? 0)) ||
        CONFIDENCE_GATES.some((gate) => (gates[gate] ?? 0) !== gateValue(editing, gate))),
  );

  async function save() {
    if (!editing || !balanced || !gatesInRange) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const factors = Object.fromEntries(FACTOR_ORDER.map((key) => [key, { ...editing.factors[key], weight: weights[key] ?? 0 }]));
      const confidence = Object.fromEntries(CONFIDENCE_GATES.map((gate) => [gate, gates[gate] ?? gateValue(editing, gate)]));
      const wasDraft = editing.status === 'draft';
      const updated = await matricesApi.update(editing._id, { factors, confidence });
      setSaved(t(wasDraft ? 'savedDraft' : 'saved', { version: String(updated.version ?? '') }));
      await load();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  function askForConfirmation(action: LifecycleAction) {
    setActionError(null);
    setChangeRef('');
    setPending(action);
  }

  async function confirmAction() {
    const draft = group?.draft;
    if (!pending || !draft) return;
    if (pending === 'approve' && !changeRef.trim()) {
      setActionError(t('lifecycle.changeRefRequired'));
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      if (pending === 'approve') await matricesApi.approve!(draft._id, changeRef.trim());
      if (pending === 'activate') await matricesApi.activate!(draft._id);
      if (pending === 'discard') await matricesApi.deactivate!(draft._id);
      setSaved(t(`lifecycle.done.${pending}`, { version: String(draft.version ?? '') }));
      setPending(null);
      await load();
    } catch (e) {
      setActionError(toApiError(e).message);
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if (error && !editing) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  // A tenant with no matrix is not a dead end: the scoring sheet in a training dataset creates, approves and
  // activates one. Say so, because this screen cannot create it and an unexplained empty state reads as broken.
  if (!group || !editing)
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm shadow-[0_1px_2px_rgba(15,35,65,0.05)]">
        <p className="text-muted-foreground">{t('empty')}</p>
        <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/admin/datasets" />}>
          {t('emptyAction')}
        </Button>
      </div>
    );

  const draft = group.draft;
  const approved = Boolean(draft?.approvedBy);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(15,35,65,0.05)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-[-0.01em]">{t('heading', { name: group.name })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.rich('description', {
              range: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {groups.length > 1 && (
            <select
              aria-label={t('matrixLabel')}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={group.id}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <Badge variant="outline">{t('versionLabel', { version: String(editing.version ?? 1) })}</Badge>
          <Badge variant={editing.status === 'active' ? 'default' : 'secondary'}>{statusT(editing.status)}</Badge>
        </div>
      </div>

      {draft && (
        <div className="mt-5 rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-400/30 dark:bg-amber-400/10" role="status">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                <AlertTriangle className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{t('lifecycle.title', { version: String(draft.version ?? '') })}</p>
                <p className="mt-1 text-xs leading-5 text-amber-950/80 dark:text-amber-100/80">
                  {approved
                    ? t('lifecycle.approvedDescription')
                    : t('lifecycle.draftDescription', { active: group.active ? String(group.active.version ?? '') : t('lifecycle.noActive') })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!approved && (
                <Button size="sm" variant="secondary" onClick={() => askForConfirmation('approve')}>
                  {t('lifecycle.approve')}
                </Button>
              )}
              <Button size="sm" disabled={!approved} onClick={() => askForConfirmation('activate')}>
                {t('lifecycle.activate')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => askForConfirmation('discard')}>
                {t('lifecycle.discard')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 hidden grid-cols-[minmax(11rem,1fr)_minmax(0,2.4fr)_7rem] items-center gap-4 px-1 pb-2 text-sm font-semibold text-foreground/80 sm:grid">
        <span>{t('columns.factor')}</span>
        <span>{t('columns.weight')}</span>
        <span className="text-right">{t('columns.impact')}</span>
      </div>

      <div className="overflow-hidden rounded-xl border">
        {FACTOR_ORDER.map((key) => {
          const { icon: Icon, className } = FACTOR_ICON[key];
          const value = weights[key] ?? 0;
          return (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-4 gap-y-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(11rem,1fr)_minmax(0,2.4fr)_7rem]">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${className}`}>
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <label className="truncate text-sm font-medium" htmlFor={`weight-${key}`}>
                  {t(`factors.${key}`)}
                </label>
              </div>
              <span className="text-right text-sm font-bold tabular-nums sm:col-start-3 sm:row-start-1">{value}%</span>
              <input
                id={`weight-${key}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                className="weight-slider col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                style={{ '--weight-fill': `${value}%` } as React.CSSProperties}
              />
            </div>
          );
        })}
        <div className={`flex items-center gap-2 border-t px-4 py-3 text-sm font-semibold ${balanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
          {t('totalWeight', { total: String(Math.round(total * 100) / 100) })}
          {balanced ? (
            <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-white" aria-hidden="true">
              <Check className="size-3" />
            </span>
          ) : null}
        </div>
      </div>
      {!balanced && <p className="mt-2 text-sm text-destructive">{t('totalWeightHint')}</p>}

      <h3 className="mt-7 font-heading text-base font-bold tracking-[-0.01em]">{t('thresholdsTitle')}</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CLASSIFICATION_ORDER.map((classification) => {
          const range = editing.thresholds[classification];
          const { icon: Icon, tile, value } = CLASSIFICATION_STYLE[classification];
          return (
            <div key={classification} className="flex items-start gap-3 rounded-xl border p-4">
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tile}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{classificationT(classification)}</p>
                <p className={`mt-1 font-heading text-xl font-bold tabular-nums ${value}`}>
                  {range.min}–{range.max}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t(`thresholdHints.${classification}`)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* FR-20 / AI-03: the two cutoffs the computed confidence is measured against. */}
      <h3 className="mt-7 font-heading text-base font-bold tracking-[-0.01em]">{t('confidenceTitle')}</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {CONFIDENCE_GATES.map((gate) => (
          <div key={gate} className="space-y-1 rounded-xl border p-4">
            <Label htmlFor={gate}>{t(`confidenceGates.${gate}`)}</Label>
            <Input
              id={gate}
              type="number"
              min={0}
              max={100}
              value={gates[gate] ?? 0}
              onChange={(e) => setGates((g) => ({ ...g, [gate]: Number(e.target.value) }))}
            />
            <p className="text-xs leading-5 text-muted-foreground">{t(`confidenceHints.${gate}`)}</p>
          </div>
        ))}
      </div>
      {!gatesInRange && <p className="mt-2 text-sm text-destructive">{t('confidenceHint')}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!balanced || !gatesInRange || !dirty || saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        {saved && <p className="text-sm text-emerald-700 dark:text-emerald-300">{saved}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </div>
      <p className="mt-4 text-sm italic text-muted-foreground">{t('footnote')}</p>

      <Dialog open={pending !== null} onOpenChange={(next) => !next && !actionBusy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending ? t(`lifecycle.confirm.title.${pending}`) : ''}</DialogTitle>
            <DialogDescription>
              {pending ? t(`lifecycle.confirm.description.${pending}`, { version: String(draft?.version ?? '') }) : ''}
            </DialogDescription>
          </DialogHeader>
          {pending === 'approve' ? (
            <div className="space-y-1">
              <Label htmlFor="matrix-change-reference">{t('lifecycle.changeRef')}</Label>
              <Input
                id="matrix-change-reference"
                value={changeRef}
                onChange={(e) => setChangeRef(e.target.value)}
                placeholder={t('lifecycle.changeRefPlaceholder')}
                disabled={actionBusy}
              />
              <p className="text-xs text-muted-foreground">{t('lifecycle.changeRefHelp')}</p>
            </div>
          ) : null}
          {actionError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => setPending(null)}>
              {t('lifecycle.cancel')}
            </Button>
            <Button
              type="button"
              variant={pending === 'discard' ? 'destructive' : 'default'}
              disabled={actionBusy}
              onClick={() => void confirmAction()}
            >
              {actionBusy ? t('lifecycle.working') : pending ? t(`lifecycle.confirm.button.${pending}`) : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
