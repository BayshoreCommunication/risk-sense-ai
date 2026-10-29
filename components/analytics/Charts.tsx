'use client';

import { useId, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatIdentifierLabel } from '@/lib/format-identifier-label';

/**
 * Minimal inline-SVG charts for DASH-03 (no chart library). Colors come from the validated reference
 * palette (docs: dataviz skill, palette.md): categorical slots in fixed order, status colors for the
 * four classifications, sequential blue for single-series magnitude. Every chart ships a hover layer
 * and the page pairs each one with a table view; series identity is never color alone (legend + labels).
 */
export const SERIES_LIGHT = ['#2f6fb3', '#b85c34', '#2e7d66', '#a66b1f', '#a04f75', '#4f7a43', '#6656a3', '#b84a4a', '#667085'];
export const SERIES_DARK = ['#5b9be0', '#d97a4e', '#48a689', '#c9973a', '#c9749b', '#73a261', '#9184ce', '#d96b6b', '#98a2b3'];
/** Classification = ordered status: monitor_only → good, risk → warning, elevated_risk → serious, issue → critical. */
export const STATUS: Record<string, { color: string; icon: string }> = {
  monitor_only: { color: '#23825b', icon: '●' },
  risk: { color: '#bd811f', icon: '▲' },
  elevated_risk: { color: '#c96e48', icon: '◆' },
  issue: { color: '#c64a4a', icon: '■' },
};

export interface StackedClassificationMonth {
  key: string;
  label: string;
  total: number | null;
  segments: { key: string; label: string; value: number | null }[];
}

export function ChartStyles() {
  return (
    <style>{`
      .viz { --viz-surface:transparent; --viz-ink:#172033; --viz-ink2:#475467; --viz-muted:#667085; --viz-grid:#dbe2ea; --viz-axis:#bcc6d2; --viz-tooltip-bg:#172033; --viz-tooltip-text:#f8fafc; --viz-tooltip-border:#344054; --viz-point-ring:#ffffff;
        ${SERIES_LIGHT.map((c, i) => `--s${i + 1}:${c};`).join('')} }
      .dark .viz { --viz-surface:transparent; --viz-ink:var(--foreground); --viz-ink2:color-mix(in srgb,var(--foreground) 78%,transparent); --viz-muted:var(--muted-foreground); --viz-grid:color-mix(in srgb,var(--border) 78%,transparent); --viz-axis:var(--border); --viz-tooltip-bg:#132238; --viz-tooltip-text:#f8fafc; --viz-tooltip-border:#36516f; --viz-point-ring:var(--card);
        ${SERIES_DARK.map((c, i) => `--s${i + 1}:${c};`).join('')} }
      .viz text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    `}</style>
  );
}

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function Tooltip({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  const w = Math.max(...lines.map((l) => l.length)) * 6.2 + 16;
  const h = lines.length * 14 + 10;
  const tx = Math.min(Math.max(x - w / 2, PAD.left), W - PAD.right - w);
  const ty = y - h - 10 < PAD.top ? y + 12 : y - h - 10;
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={h} rx={5} fill="var(--viz-tooltip-bg)" stroke="var(--viz-tooltip-border)" strokeWidth={1} />
      {lines.map((l, i) => (
        <text key={i} x={tx + 8} y={ty + 14 + i * 14} fontSize={11} fontWeight={i === 0 ? 600 : 400} fill="var(--viz-tooltip-text)">
          {l}
        </text>
      ))}
    </g>
  );
}

/** Single-series vertical bars (magnitude over time). */
export function BarChart({ data, format = (v) => String(v), title }: { data: { label: string; value: number }[]; format?: (v: number) => string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(28, slot - 2)); // 2px surface gap between bars
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const every = Math.ceil(data.length / 12);
  const active = hover ?? selected;
  return (
    <div className="viz">
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-roledescription="interactive chart" aria-labelledby={id} onMouseLeave={() => setHover(null)}>
      <title id={id}>{title}</title>
      <rect x={0} y={0} width={W} height={H} fill="var(--viz-surface)" rx={6} />
      {ticks.map((t) => {
        const y = PAD.top + innerH - (t / max) * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} fontSize={10} textAnchor="end" fill="var(--viz-muted)">
              {format(t)}
            </text>
          </g>
        );
      })}
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--viz-axis)" />
      {data.map((d, i) => {
        const x = PAD.left + i * slot + (slot - barW) / 2;
        const h = (d.value / max) * innerH;
        const y = PAD.top + innerH - h;
        return (
          <g key={d.label}>
            <path
              d={h > 0 ? `M${x},${y + innerH - (innerH - h)} v${-(h - Math.min(4, h))} q0,-${Math.min(4, h)} ${Math.min(4, h)},-${Math.min(4, h)} h${barW - 2 * Math.min(4, h)} q${Math.min(4, h)},0 ${Math.min(4, h)},${Math.min(4, h)} v${h - Math.min(4, h)} z` : ''}
              fill={selected === i ? 'var(--s2)' : 'var(--s1)'}
              opacity={active === null || active === i ? 1 : 0.38}
            />
            {i % every === 0 && (
              <text x={PAD.left + i * slot + slot / 2} y={H - 10} fontSize={10} fontWeight={selected === i ? 700 : 400} textAnchor="middle" fill={selected === i ? 'var(--viz-ink)' : 'var(--viz-muted)'}>
                {d.label}
              </text>
            )}
            <rect
              x={PAD.left + i * slot}
              y={PAD.top}
              width={slot}
              height={innerH}
              fill="transparent"
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={`${d.label}: ${format(d.value)}`}
              aria-pressed={selected === i}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => setSelected((current) => (current === i ? null : i))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelected((current) => (current === i ? null : i));
                }
              }}
            />
          </g>
        );
      })}
      {active !== null && data[active] && <Tooltip x={PAD.left + active * slot + slot / 2} y={PAD.top + innerH - (data[active].value / max) * innerH} lines={[data[active].label, format(data[active].value)]} />}
    </svg>
    {selected !== null && data[selected] && (
      <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3 text-sm" role="status">
        <span className="font-medium">{data[selected].label}</span>
        <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold tabular-nums text-blue-700 dark:bg-blue-400/15 dark:text-blue-300">{format(data[selected].value)}</span>
      </div>
    )}
    </div>
  );
}

/** Multi-series lines (change over time). Series keep their slot by index; ≤ 4 get direct end labels; legend always present for ≥ 2. */
export function LineChart({ periods, series, format = (v) => String(v), title, unit = '' }: { periods: string[]; series: { name: string; values: (number | null)[] }[]; format?: (v: number) => string; title: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const innerW = W - PAD.left - PAD.right - (series.length > 1 ? 90 : 0);
  const innerH = H - PAD.top - PAD.bottom;
  const xAt = (i: number) => PAD.left + (periods.length > 1 ? (i / (periods.length - 1)) * innerW : innerW / 2);
  const yAt = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const every = Math.ceil(periods.length / 8);
  const active = hover ?? selected;
  return (
    <div className="viz">
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-roledescription="interactive chart" aria-labelledby={id} onMouseLeave={() => setHover(null)}>
      <title id={id}>{title}</title>
      <rect x={0} y={0} width={W} height={H} fill="var(--viz-surface)" rx={6} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={PAD.left + innerW} y1={yAt(t)} y2={yAt(t)} stroke="var(--viz-grid)" />
          <text x={PAD.left - 6} y={yAt(t) + 4} fontSize={10} textAnchor="end" fill="var(--viz-muted)">
            {format(t)}
          </text>
        </g>
      ))}
      {periods.map((p, i) => i % every === 0 && (
        <text key={p} x={xAt(i)} y={H - 10} fontSize={10} textAnchor="middle" fill="var(--viz-muted)">
          {p}
        </text>
      ))}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => (v === null ? null : [xAt(i), yAt(v)] as const));
        const d = pts.map((p, i) => (p ? `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0]},${p[1]}` : '')).join(' ');
        const last = [...pts].reverse().find(Boolean);
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={`var(--s${si + 1})`} strokeWidth={2.5} strokeLinejoin="round" opacity={active === null ? 1 : 0.88} />
            {series.length > 1 && series.length <= 4 && last && (
              <text x={last[0] + 6} y={last[1] + 4} fontSize={10} fill="var(--viz-ink2)">
                {s.name}
              </text>
            )}
          </g>
        );
      })}
      {periods.map((period, i) => (
        <rect
          key={period}
          x={xAt(i) - (innerW / Math.max(1, periods.length - 1)) / 2}
          y={PAD.top}
          width={innerW / Math.max(1, periods.length - 1)}
          height={innerH}
          fill="transparent"
          className="cursor-pointer outline-none"
          tabIndex={0}
          role="button"
          aria-label={`${period}: ${series.map((item) => `${item.name} ${item.values[i] === null || item.values[i] === undefined ? '—' : format(item.values[i] as number) + unit}`).join(', ')}`}
          aria-pressed={selected === i}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          onClick={() => setSelected((current) => (current === i ? null : i))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelected((current) => (current === i ? null : i));
            }
          }}
        />
      ))}
      {active !== null && (
        <g>
          <line x1={xAt(active)} x2={xAt(active)} y1={PAD.top} y2={PAD.top + innerH} stroke={selected === active ? 'var(--s2)' : 'var(--viz-axis)'} strokeWidth={selected === active ? 2 : 1} strokeDasharray="3 3" />
          {series.map((s, si) => s.values[active] !== null && s.values[active] !== undefined && (
            <g key={s.name}>
              <circle cx={xAt(active)} cy={yAt(s.values[active] as number)} r={5} fill={`var(--s${si + 1})`} stroke="var(--viz-point-ring)" strokeWidth={2} />
            </g>
          ))}
          <Tooltip x={xAt(active)} y={PAD.top + 20} lines={[periods[active]!, ...series.map((s) => `${s.name}: ${s.values[active] === null || s.values[active] === undefined ? '—' : format(s.values[active] as number) + unit}`)]} />
        </g>
      )}
      {series.length > 1 && (
        <g>
          {series.map((s, si) => (
            <g key={s.name} transform={`translate(${W - PAD.right - 84}, ${PAD.top + si * 16})`}>
              <rect width={10} height={10} rx={2} fill={`var(--s${si + 1})`} />
              <text x={14} y={9} fontSize={10} fill="var(--viz-ink2)">
                {s.name.length > 13 ? `${s.name.slice(0, 12)}…` : s.name}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
    {selected !== null && periods[selected] && (
      <div className="mt-2 border-t pt-3" role="status">
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{periods[selected]}</div>
        <div className="flex flex-wrap gap-2">
          {series.map((item, index) => (
            <span key={item.name} className="inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs">
              <span className="size-2 rounded-sm" style={{ background: `var(--s${index + 1})` }} aria-hidden="true" />
              <span>{item.name}</span>
              <strong className="tabular-nums">{item.values[selected] === null || item.values[selected] === undefined ? '—' : `${format(item.values[selected] as number)}${unit}`}</strong>
            </span>
          ))}
        </div>
      </div>
    )}
    </div>
  );
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function piePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, radius, endAngle);
  const end = polarPoint(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/** Categorical pie view for distributions. Each slice is also identified by its legend label and value. */
export function PieChart({ rows, title, totalLabel }: { rows: { key: string; label: string; value: number }[]; title: string; totalLabel: string }) {
  const locale = useLocale();
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  let cursor = 0;
  return (
    <div className="viz grid items-center gap-5 sm:grid-cols-[minmax(13rem,0.8fr)_minmax(13rem,1.2fr)]">
      <svg viewBox="0 0 240 240" className="mx-auto w-full max-w-64" role="group" aria-roledescription="interactive chart" aria-labelledby={id}>
        <title id={id}>{title}</title>
        {total === 0 ? <circle cx="120" cy="120" r="84" fill="var(--viz-grid)" /> : rows.map((row, index) => {
          if (row.value <= 0) return null;
          const start = cursor;
          const sweep = (Math.max(0, row.value) / total) * 360;
          const end = start + sweep;
          cursor = end;
          const statusColor = STATUS[row.key]?.color;
          return (
            <path
              key={row.key}
              d={piePath(120, 120, selected === row.key ? 92 : 86, start, Math.max(start + 0.01, end - 0.8))}
              fill={statusColor ?? `var(--s${index + 1})`}
              opacity={selected === null || selected === row.key ? 1 : 0.35}
              className="pointer-events-none transition-opacity"
              aria-hidden="true"
            />
          );
        })}
        <circle cx="120" cy="120" r="48" fill="var(--card)" />
        <text x="120" y="116" textAnchor="middle" fontSize="11" fill="var(--viz-muted)">{totalLabel}</text>
        <text x="120" y="139" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--viz-ink)">{total.toLocaleString(locale)}</text>
      </svg>
      <div className="divide-y divide-border/70 border-y">
        {rows.map((row, index) => {
          const statusColor = STATUS[row.key]?.color;
          return (
            <button key={row.key} type="button" className="flex w-full items-center gap-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-pressed={selected === row.key} onClick={() => setSelected((current) => current === row.key ? null : row.key)}>
              <span className="size-2.5 rounded-sm" style={{ background: statusColor ?? `var(--s${index + 1})` }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <strong className="tabular-nums">{row.value.toLocaleString(locale)}</strong>
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{total ? `${Math.round((row.value / total) * 100)}%` : '0%'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Classification distribution: horizontal bars in status colors with icon + label (never color alone). */
export function StatusBars({ rows }: { rows: { key: string; count: number; share: number | null }[] }) {
  const locale = useLocale();
  const classification = useTranslations('classification');
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="viz space-y-1 rounded-xl" style={{ background: 'var(--viz-surface)' }}>
      {rows.map((r) => {
        const st = STATUS[r.key] ?? { color: 'var(--s9)', icon: '●' };
        const label = classification.has(r.key) ? classification(r.key) : formatIdentifierLabel(r.key);
        return (
          <button
            key={r.key}
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left text-sm transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background: selected === r.key ? `color-mix(in srgb, ${st.color} 9%, transparent)` : undefined,
              borderColor: selected === r.key ? `color-mix(in srgb, ${st.color} 38%, transparent)` : undefined,
            }}
            title={`${label}: ${r.count} (${r.share ?? 0}%)`}
            aria-pressed={selected === r.key}
            onClick={() => setSelected((current) => (current === r.key ? null : r.key))}
          >
            <span className="w-32 shrink-0" style={{ color: 'var(--viz-ink)' }}>
              <span style={{ color: st.color, opacity: selected === null || selected === r.key ? 1 : 0.5 }}>{st.icon}</span> {label}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded" style={{ background: 'var(--viz-grid)' }}>
              <div className="h-3 rounded" style={{ width: `${(r.count / max) * 100}%`, background: st.color, opacity: selected === null || selected === r.key ? 1 : 0.45 }} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums" style={{ color: 'var(--viz-ink2)' }}>
              {r.count.toLocaleString(locale)} · {r.share ?? 0}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Five-month classification composition. Bars share one zero baseline and every non-zero segment is
 * a native button, so month and classification drill-down remain keyboard-operable and never depend
 * on color alone.
 */
export function StackedClassificationChart({
  months,
  title,
  selectedMonth,
  selectedClassification,
  onMonthSelect,
  onSegmentSelect,
  selectMonthLabel,
}: {
  months: StackedClassificationMonth[];
  title: string;
  selectedMonth: string | null;
  selectedClassification: string | null;
  onMonthSelect: (month: string) => void;
  onSegmentSelect: (month: string, classification: string) => void;
  selectMonthLabel: (month: string, total: string) => string;
}) {
  const locale = useLocale();
  const observedTotal = (month: StackedClassificationMonth) => {
    if (typeof month.total === 'number') return month.total;
    if (month.segments.some((segment) => segment.value === null)) return null;
    return month.segments.reduce((sum, segment) => sum + (segment.value ?? 0), 0);
  };
  const maxTotal = Math.max(1, ...months.map((month) => observedTotal(month) ?? 0));
  const tickValues = [maxTotal, Math.round(maxTotal / 2), 0];

  return (
    <div className="viz" role="group" aria-label={title}>
      <div className="overflow-x-auto pb-2 pt-1">
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
            <div className="flex h-60 flex-col justify-between pb-px text-right text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
              {tickValues.map((tick, index) => (
                <span key={`${tick}-${index}`}>{tick.toLocaleString(locale)}</span>
              ))}
            </div>
            <div className="relative h-60 border-b">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                {tickValues.map((tick, index) => (
                  <span key={`${tick}-${index}`} className="block border-t border-dashed border first:border-solid" />
                ))}
              </div>
              <div className="absolute inset-0 flex items-end justify-around gap-10 px-8">
                {months.map((month) => {
                  const total = observedTotal(month);
                  const isSelectedMonth = selectedMonth === month.key;
                  // The column is only as tall as its data: no empty outline above the stack.
                  const stackHeight = total === null || total <= 0 ? 0 : (total / maxTotal) * 100;
                  return (
                    <div
                      key={month.key}
                      className={`flex h-full min-w-10 max-w-16 flex-1 items-end border-x border-transparent transition-colors ${isSelectedMonth ? 'border-primary/15 bg-primary/[0.035]' : ''}`}
                      aria-label={`${month.label}: ${total === null ? '—' : total.toLocaleString(locale)}`}
                    >
                      <div
                        className={`flex w-full flex-col-reverse overflow-hidden rounded-t-[3px] transition-[box-shadow,opacity] ${isSelectedMonth ? 'ring-1 ring-primary/55' : 'ring-1 ring-border/80'}`}
                        style={{ height: `${stackHeight}%` }}
                      >
                        {month.segments.map((segment, index) => {
                          const status = STATUS[segment.key] ?? { color: `var(--s${index + 1})`, icon: '●' };
                          const value = typeof segment.value === 'number' && segment.value > 0 ? segment.value : null;
                          const dimmed = selectedClassification !== null && selectedClassification !== segment.key;
                          if (value === null || total === null || total <= 0) return null;
                          const height = (value / total) * 100;
                          return (
                            <button
                              key={segment.key}
                              type="button"
                              className="group relative w-full outline-none transition-opacity hover:opacity-85 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                              style={{
                                height: `${height}%`,
                                minHeight: '0.3rem',
                                background: status.color,
                                opacity: dimmed ? 0.45 : 1,
                              }}
                              title={`${month.label} · ${status.icon} ${segment.label}: ${value.toLocaleString(locale)}`}
                              aria-label={`${month.label} · ${segment.label}: ${value.toLocaleString(locale)}`}
                              aria-pressed={isSelectedMonth && selectedClassification === segment.key}
                              onClick={() => onSegmentSelect(month.key, segment.key)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="ml-[3.5rem] grid grid-cols-5 gap-3 pt-3">
            {months.map((month) => {
              const total = observedTotal(month);
              return (
                <button
                  key={month.key}
                  type="button"
                  className={`rounded-md border border-transparent px-1.5 py-1.5 text-center text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${selectedMonth === month.key ? 'border-border bg-muted/70 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                  aria-label={selectMonthLabel(month.label, total === null ? '—' : total.toLocaleString(locale))}
                  aria-pressed={selectedMonth === month.key}
                  onClick={() => onMonthSelect(month.key)}
                >
                  <span className="block truncate">{month.label}</span>
                  <span className="mt-0.5 block text-[10px] font-medium tabular-nums">{total === null ? '—' : total.toLocaleString(locale)}</span>
                </button>
              );
            })}
          </div>
          {/* Legend, as docs/design/figma-frames/17-admin-analytics-dashboard.png shows under the bars. */}
          <div className="ml-[3.5rem] mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4" aria-hidden="true">
            {(months[0]?.segments ?? []).map((segment, index) => {
              const status = STATUS[segment.key] ?? { color: `var(--s${index + 1})`, icon: '●' };
              const dimmed = selectedClassification !== null && selectedClassification !== segment.key;
              return (
                <span key={segment.key} className={`flex items-center gap-2 text-xs ${dimmed ? 'text-muted-foreground/55' : 'text-foreground/80'}`}>
                  <span className="size-2 rounded-full" style={{ background: status.color, opacity: dimmed ? 0.45 : 1 }} />
                  {segment.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Figma-aligned headline metric with a semantic icon tile and live-data context. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'blue',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'violet';
}) {
  const tones = {
    blue: 'text-blue-700 dark:text-blue-300',
    green: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    violet: 'text-violet-700 dark:text-violet-300',
  } as const;

  return (
    <div className="flex min-h-20 items-center gap-3 rounded-lg border bg-card p-3 min-[96rem]:min-h-24 min-[96rem]:p-4">
      <span className={`grid size-9 shrink-0 place-items-center rounded-md border border-current/10 bg-muted/35 min-[96rem]:size-10 ${tones[tone]}`} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-heading text-xl font-semibold tracking-tight tabular-nums min-[96rem]:text-2xl">{value}</div>
        <div className="mt-0.5 text-[0.82rem] font-medium text-foreground min-[96rem]:text-sm">{label}</div>
        {hint ? <div className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground min-[96rem]:leading-5" title={hint}>{hint}</div> : null}
      </div>
    </div>
  );
}
