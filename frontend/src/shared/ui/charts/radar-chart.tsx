'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import { ChartDataTable, ChartLegend } from './chart-parts';
import { colorAt, type ChartSeries, type ValueFormatter } from './chart-utils';

/** Point on a radar axis: axis `i` of `n`, radius fraction `f` (0–1), centred in a `size` square. */
export function radarPoint(i: number, n: number, f: number, size: number): [number, number] {
  const angle = (Math.PI * 2 * i) / n - Math.PI / 2; // first axis points up
  const r = (size / 2) * 0.72 * f;
  return [size / 2 + r * Math.cos(angle), size / 2 + r * Math.sin(angle)];
}

/** Axis labels centre near the vertical axis, start right of the centre and end left of it. */
function labelAnchor(x: number, centre: number): 'middle' | 'start' | 'end' {
  if (Math.abs(x - centre) < 4) return 'middle';
  return x > centre ? 'start' : 'end';
}

/**
 * Radar (spider) chart comparing up to ~3 series across 3–10 dimensions
 * (e.g. this quarter vs last quarter). Hover a series in the legend to focus it.
 */
export function RadarChart({
  axes,
  series,
  values,
  max = 100,
  rings = 4,
  size = 280,
  formatValue = String,
  title,
  className,
}: Readonly<{
  /** Dimension labels. */
  axes: string[];
  series: ChartSeries[];
  /** values[seriesKey][axisIndex] */
  values: Record<string, number[]>;
  max?: number;
  rings?: number;
  size?: number;
  formatValue?: ValueFormatter;
  title: string;
  className?: string;
}>) {
  const [focus, setFocus] = useState<string | null>(null);
  const n = axes.length;
  const polygon = (vals: number[]) =>
    vals
      .map((v, i) => radarPoint(i, n, Math.max(0, Math.min(1, v / max)), size).join(','))
      .join(' ');

  return (
    <figure className={cn('relative flex min-w-0 flex-col items-center', className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full overflow-visible"
        style={{ maxWidth: size }}
        role="img"
        aria-label={title}
      >
        {Array.from({ length: rings }, (_, r) => (
          <polygon
            key={r}
            points={polygon(axes.map(() => ((r + 1) / rings) * max))}
            fill="none"
            className="stroke-border"
            strokeDasharray={r === rings - 1 ? undefined : '3 3'}
          />
        ))}
        {axes.map((axis, i) => {
          const [x, y] = radarPoint(i, n, 1, size);
          const [lx, ly] = radarPoint(i, n, 1.2, size);
          return (
            <g key={axis}>
              <line x1={size / 2} y1={size / 2} x2={x} y2={y} className="stroke-border" />
              <text
                x={lx}
                y={ly}
                dy="0.32em"
                textAnchor={labelAnchor(lx, size / 2)}
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {axis}
              </text>
            </g>
          );
        })}
        {series.map((s, si) => {
          const color = colorAt(si, s.color);
          const dim = focus !== null && focus !== s.key;
          return (
            <g key={s.key} opacity={dim ? 0.2 : 1} className="transition-opacity">
              <polygon
                points={polygon(values[s.key] ?? [])}
                fill={color}
                fillOpacity={0.18}
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {keyed(
                (values[s.key] ?? []).map((v, i) => ({ v, i })),
                (p) => axes[p.i] ?? '',
              ).map(({ key, item: { v, i } }) => {
                const [x, y] = radarPoint(i, n, Math.max(0, Math.min(1, v / max)), size);
                return (
                  <circle
                    key={key}
                    cx={x}
                    cy={y}
                    r={3}
                    fill={color}
                    className="stroke-surface"
                    strokeWidth={1.5}
                  >
                    <title>{`${s.label} · ${axes[i]}: ${formatValue(v)}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-2" onPointerLeave={() => setFocus(null)}>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <li key={s.key} onPointerEnter={() => setFocus(s.key)}>
              <ChartLegend items={[{ label: s.label, color: colorAt(i, s.color) }]} />
            </li>
          ))}
        </ul>
      </div>
      <ChartDataTable
        caption={title}
        headers={['', ...series.map((s) => s.label)]}
        rows={axes.map((a, i) => [a, ...series.map((s) => formatValue(values[s.key]?.[i] ?? 0))])}
      />
    </figure>
  );
}
