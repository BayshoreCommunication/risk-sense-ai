'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { matricesApi, type Item } from '@/lib/admin/content';
import { toApiError } from '@/lib/api/client';

/** Factor order and iconography follow docs/design/figma-frames/15-admin-scoring-matrix.png. */
const FACTOR_ORDER = ['controlEffectiveness', 'impact', 'severity', 'likelihood', 'duration', 'regulatorySensitivity'] as const;
type FactorKey = (typeof FACTOR_ORDER)[number];

const FACTOR_ICON: Record<FactorKey, { icon: LucideIcon; className: string }> = {
  controlEffectiveness: { icon: Target, className: 'bg-blue-500/10 text-blue-700' },
  impact: { icon: BarChart3, className: 'bg-emerald-500/10 text-emerald-700' },
  severity: { icon: AlertTriangle, className: 'bg-amber-500/10 text-amber-700' },
  likelihood: { icon: ShieldHalf, className: 'bg-violet-500/10 text-violet-700' },
  duration: { icon: Clock, className: 'bg-slate-500/10 text-slate-700' },
  regulatorySensitivity: { icon: Scale, className: 'bg-teal-500/10 text-teal-700' },
};

const CLASSIFICATION_ORDER = ['monitor_only', 'risk', 'elevated_risk', 'issue'] as const;
type Classification = (typeof CLASSIFICATION_ORDER)[number];

const CLASSIFICATION_STYLE: Record<Classification, { icon: LucideIcon; tile: string; value: string }> = {
  monitor_only: { icon: Eye, tile: 'bg-blue-500/10 text-blue-600', value: 'text-blue-700' },
  risk: { icon: AlertTriangle, tile: 'bg-amber-500/10 text-amber-600', value: 'text-amber-700' },
  elevated_risk: { icon: ArrowUpCircle, tile: 'bg-orange-500/12 text-orange-600', value: 'text-orange-700' },
  issue: { icon: Bell, tile: 'bg-red-500/10 text-red-600', value: 'text-red-700' },
};

type Factor = { weight: number; scale: { min: number; max: number }; mapping: unknown[] };
type Range = { min: number; max: number };
type Matrix = Item & {
  name: string;
  sector?: string;
  factors: Record<FactorKey, Factor>;
  thresholds: Record<Classification, Range>;
};

function isMatrix(item: Item): item is Matrix {
  return typeof (item as Matrix).factors === 'object' && (item as Matrix).factors !== null;
}

/**
 * Administrator scoring matrix configuration (FR-18, FR-19). Weights are edited as percentages that
 * must total 100; thresholds stay contiguous across 0–100. Saving an active matrix creates a new
 * version, which still needs independent approval and activation before it scores anything (AI-05).
 */
export function ScoringMatrixEditor() {
  const t = useTranslations('admin.scoring.editor');
  const classificationT = useTranslations('classification');
  const statusT = useTranslations('status');

  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = (await matricesApi.list({ view: 'current' })).filter(isMatrix);
      setMatrices(list);
      setSelectedId((current) => current ?? list[0]?._id ?? null);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matrix = useMemo(() => matrices.find((m) => m._id === selectedId) ?? null, [matrices, selectedId]);

  // Reset the draft whenever a different matrix (or a newly saved version) becomes current.
  useEffect(() => {
    if (!matrix) return;
    setWeights(Object.fromEntries(FACTOR_ORDER.map((key) => [key, matrix.factors[key]?.weight ?? 0])));
    setSaved(null);
  }, [matrix]);

  const total = FACTOR_ORDER.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
  const balanced = Math.round(total * 100) / 100 === 100;
  const dirty = Boolean(matrix) && FACTOR_ORDER.some((key) => (weights[key] ?? 0) !== (matrix?.factors[key]?.weight ?? 0));

  async function save() {
    if (!matrix || !balanced) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const factors = Object.fromEntries(
        FACTOR_ORDER.map((key) => [key, { ...matrix.factors[key], weight: weights[key] ?? 0 }]),
      );
      const updated = await matricesApi.update(matrix._id, { factors });
      setSaved(t('saved', { version: String(updated.version ?? '') }));
      await load();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if (error && !matrix) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!matrix) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(15,35,65,0.04)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-[-0.01em]">{t('heading', { name: matrix.name })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.rich('description', {
              range: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {matrices.length > 1 && (
            <select
              aria-label={t('matrixLabel')}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={matrix._id}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {matrices.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <Badge variant="outline">{t('versionLabel', { version: String(matrix.version ?? 1) })}</Badge>
          <Badge variant={matrix.status === 'active' ? 'default' : 'secondary'}>{statusT(matrix.status)}</Badge>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(11rem,1fr)_minmax(0,2.4fr)_7rem] items-center gap-4 px-1 pb-2 text-sm font-semibold text-foreground/80">
        <span>{t('columns.factor')}</span>
        <span>{t('columns.weight')}</span>
        <span className="text-right">{t('columns.impact')}</span>
      </div>

      <div className="overflow-hidden rounded-xl border">
        {FACTOR_ORDER.map((key) => {
          const { icon: Icon, className } = FACTOR_ICON[key];
          const value = weights[key] ?? 0;
          return (
            <div key={key} className="grid grid-cols-[minmax(11rem,1fr)_minmax(0,2.4fr)_7rem] items-center gap-4 border-b p-4 last:border-b-0">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${className}`}>
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <label className="truncate text-sm font-medium" htmlFor={`weight-${key}`}>
                  {t(`factors.${key}`)}
                </label>
              </div>
              <input
                id={`weight-${key}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                className="weight-slider"
                style={{ '--weight-fill': `${value}%` } as React.CSSProperties}
              />
              <span className="text-right text-sm font-bold tabular-nums">{value}%</span>
            </div>
          );
        })}
        <div className={`flex items-center gap-2 border-t px-4 py-3 text-sm font-semibold ${balanced ? 'text-emerald-700' : 'text-destructive'}`}>
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
          const range = matrix.thresholds[classification];
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!balanced || !dirty || saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        {saved && <p className="text-sm text-emerald-700">{saved}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </div>
      <p className="mt-4 text-sm italic text-muted-foreground">{t('footnote')}</p>
    </section>
  );
}
