'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import { colorAt } from './chart-utils';

/**
 * Small visual indicators: RadialProgress (ring gauge), Sparkline (inline
 * trend) and Heatmap (matrix of intensities, e.g. hour × weekday).
 */

type GaugeLevel = 'success' | 'warning' | 'danger';

/** Traffic-light level of a percentage; `invert` for "higher is better" metrics. */
function gaugeLevel(
  pct: number,
  thresholds: { warning: number; danger: number },
  invert: boolean,
): GaugeLevel {
  if (invert) {
    if (pct <= 100 - thresholds.danger) return 'danger';
    return pct <= 100 - thresholds.warning ? 'warning' : 'success';
  }
  if (pct >= thresholds.danger) return 'danger';
  return pct >= thresholds.warning ? 'warning' : 'success';
}

/** Ring gauge for a ratio (SLA, utilisation, completion). Colour follows thresholds. */
export function RadialProgress({
  value,
  max = 100,
  size = 96,
  thickness = 9,
  label,
  sublabel,
  tone = 'auto',
  thresholds = { warning: 75, danger: 90 },
  invert = false,
  className,
}: Readonly<{
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  /** Centre text (defaults to the percentage). */
  label?: ReactNode;
  sublabel?: ReactNode;
  /** auto = green/amber/red by threshold; or a fixed palette tone. */
  tone?: 'auto' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  thresholds?: { warning: number; danger: number };
  /** For "higher is better" metrics (uptime): low values turn red instead. */
  invert?: boolean;
  className?: string;
}>) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const level = gaugeLevel(pct, thresholds, invert);
  const color = {
    primary: 'var(--brand-primary)',
    secondary: 'var(--brand-secondary)',
    success: 'var(--success)',
    warning: 'var(--chart-5)',
    danger: 'var(--danger)',
  }[tone === 'auto' ? level : tone];

  return (
    <div
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {/* The ring is drawn; assistive technology reads this meter instead. */}
      <meter
        className="sr-only"
        min={0}
        max={max}
        value={value}
        aria-label={typeof sublabel === 'string' ? sublabel : undefined}
      />
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-muted"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
        aria-hidden
      >
        <span className="text-base leading-tight font-semibold tabular">
          {label ?? `${pct.toFixed(pct < 10 ? 1 : 0)}%`}
        </span>
        {sublabel ? (
          <span className="max-w-[80%] truncate text-[10px] text-muted-foreground">{sublabel}</span>
        ) : null}
      </div>
    </div>
  );
}

/** Inline trend line (KPI cards, table cells). */
export function Sparkline({
  values,
  width = 96,
  height = 32,
  color = colorAt(0),
  area = true,
  className,
}: Readonly<{
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  area?: boolean;
  className?: string;
}>) {
  const id = useId().replaceAll(':', '');
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map(
    (v, i) =>
      [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)] as const,
  );
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const last = pts.at(-1)!;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area ? <path d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} /> : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}

/** Intensity matrix (rows × columns), e.g. transactions per weekday × hour. */
export function Heatmap({
  rows,
  columns,
  values,
  formatValue = String,
  title,
  color = 'var(--brand-primary)',
  columnLabelEvery = 3,
  className,
}: Readonly<{
  rows: string[];
  columns: string[];
  /** values[row][column] */
  values: number[][];
  formatValue?: (v: number) => string;
  title: string;
  color?: string;
  columnLabelEvery?: number;
  className?: string;
}>) {
  const max = Math.max(1, ...values.flat());
  return (
    <figure className={cn('relative min-w-0 overflow-x-auto', className)} aria-label={title}>
      {/* A picture of the data: the figure's label is its text alternative. */}
      <div
        aria-hidden
        className="inline-grid min-w-full gap-[3px]"
        style={{ gridTemplateColumns: `auto repeat(${columns.length}, minmax(14px, 1fr))` }}
      >
        {rows.map((row, ri) => (
          <div key={row} className="contents">
            <span className="pe-2 text-[10px] leading-[18px] text-subtle-foreground">{row}</span>
            {columns.map((col, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              const intensity = v / max;
              return (
                <span
                  key={col}
                  title={`${row} · ${col}: ${formatValue(v)}`}
                  className="h-[18px] rounded-[min(var(--radius-item),4px)] ring-inset transition-transform hover:scale-110 hover:ring-1 hover:ring-foreground/40"
                  style={{
                    background: intensity === 0 ? 'var(--muted)' : color,
                    opacity: intensity === 0 ? 1 : 0.15 + intensity * 0.85,
                  }}
                />
              );
            })}
          </div>
        ))}
        <span />
        {columns.map((col, ci) => (
          <span key={col} className="text-center text-[10px] text-subtle-foreground">
            {ci % columnLabelEvery === 0 ? col : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Point on the semicircle for a 0–1 fraction (0 = left, 1 = right). */
export function semiPoint(f: number, r: number, cx: number, cy: number): [number, number] {
  const angle = Math.PI * (1 - Math.max(0, Math.min(1, f)));
  return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
}

/**
 * Semicircular dial with threshold bands and a needle — for ratios with a
 * regulatory or policy floor (liquidity, capital adequacy, NPL ratio…).
 */
export function SemiGauge({
  value,
  min = 0,
  max = 100,
  bands,
  label,
  sublabel,
  formatValue = String,
  size = 220,
  className,
}: Readonly<{
  value: number;
  min?: number;
  max?: number;
  /** Coloured ranges along the dial, e.g. [{ to: 15, tone: 'danger' }, { to: 20, tone: 'warning' }, { to: 50, tone: 'success' }]. */
  bands: Array<{ to: number; tone: 'danger' | 'warning' | 'success' | 'primary' }>;
  label?: ReactNode;
  sublabel?: ReactNode;
  formatValue?: (v: number) => string;
  size?: number;
  className?: string;
}>) {
  const stroke = size * 0.09;
  const r = size / 2 - stroke;
  const cx = size / 2;
  const cy = size / 2;
  const frac = (v: number) => (v - min) / (max - min || 1);
  const toneColor = {
    danger: 'var(--danger)',
    warning: 'var(--chart-5)',
    success: 'var(--success)',
    primary: 'var(--brand-primary)',
  } as const;
  let from = min;
  const arcs = bands.map((b) => {
    const [x1, y1] = semiPoint(frac(from), r, cx, cy);
    const [x2, y2] = semiPoint(frac(b.to), r, cx, cy);
    const d = `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`;
    from = b.to;
    return { d, tone: b.tone };
  });
  const [nx, ny] = semiPoint(frac(value), r - stroke * 1.1, cx, cy);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* The dial is drawn; assistive technology reads this meter instead. */}
      <meter
        className="sr-only"
        min={min}
        max={max}
        value={value}
        aria-label={typeof sublabel === 'string' ? sublabel : undefined}
      />
      <svg
        viewBox={`0 0 ${size} ${size / 2 + stroke}`}
        className="w-full"
        style={{ maxWidth: size }}
        aria-hidden
      >
        <path
          d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`}
          fill="none"
          className="stroke-muted"
          strokeWidth={stroke}
        />
        {keyed(arcs, (a) => a.d).map(({ key, item: a }) => (
          <path
            key={key}
            d={a.d}
            fill="none"
            stroke={toneColor[a.tone]}
            strokeWidth={stroke}
            opacity={0.9}
          />
        ))}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          className="stroke-foreground transition-all duration-700 ease-out"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={stroke * 0.55} className="fill-foreground" />
        <text
          x={cx - r}
          y={cy + stroke}
          textAnchor="middle"
          className="fill-subtle-foreground text-[10px]"
        >
          {formatValue(min)}
        </text>
        <text
          x={cx + r}
          y={cy + stroke}
          textAnchor="middle"
          className="fill-subtle-foreground text-[10px]"
        >
          {formatValue(max)}
        </text>
      </svg>
      <p className="-mt-1 text-2xl font-semibold tabular" aria-hidden>
        {label ?? formatValue(value)}
      </p>
      {sublabel ? (
        <p className="text-xs text-muted-foreground" aria-hidden>
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}
