'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Minimal inline-SVG charts for DASH-03 (no chart library). Colors come from the validated reference
 * palette (docs: dataviz skill, palette.md): categorical slots in fixed order, status colors for the
 * four classifications, sequential blue for single-series magnitude. Every chart ships a hover layer
 * and the page pairs each one with a table view; series identity is never color alone (legend + labels).
 */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#898781'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767', '#898781'];
/** Classification = ordered status: monitor_only → good, risk → warning, elevated_risk → serious, issue → critical. */
export const STATUS: Record<string, { color: string; icon: string }> = {
  monitor_only: { color: '#0ca30c', icon: '●' },
  risk: { color: '#fab219', icon: '▲' },
  elevated_risk: { color: '#ec835a', icon: '◆' },
  issue: { color: '#d03b3b', icon: '■' },
};

export function ChartStyles() {
  return (
    <style>{`
      .viz { --viz-surface:transparent; --viz-ink:#172033; --viz-ink2:#536078; --viz-muted:#7b8496; --viz-grid:#e6eaf0; --viz-axis:#cbd2dc;
        ${SERIES_LIGHT.map((c, i) => `--s${i + 1}:${c};`).join('')} }
      /* The app renders light only today; the dark steps are wired to a future .dark root class, not to the OS setting. */
      .dark .viz { --viz-surface:#1a1a19; --viz-ink:#ffffff; --viz-ink2:#c3c2b7; --viz-muted:#898781; --viz-grid:#2c2c2a; --viz-axis:#383835;
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
      <rect x={tx} y={ty} width={w} height={h} rx={4} fill="var(--viz-ink)" opacity={0.92} />
      {lines.map((l, i) => (
        <text key={i} x={tx + 8} y={ty + 14 + i * 14} fontSize={11} fill="#ffffff">
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
    <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-roledescription="interactive chart" aria-labelledby={id} onMouseLeave={() => setHover(null)}>
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
    <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-roledescription="interactive chart" aria-labelledby={id} onMouseLeave={() => setHover(null)}>
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
              <circle cx={xAt(active)} cy={yAt(s.values[active] as number)} r={5} fill={`var(--s${si + 1})`} stroke="white" strokeWidth={2} />
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
        const label = classification.has(r.key) ? classification(r.key) : r.key;
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

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="relative min-h-28 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/80 via-primary/25 to-transparent" aria-hidden="true" />
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 font-heading text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</div>}
    </div>
  );
}
