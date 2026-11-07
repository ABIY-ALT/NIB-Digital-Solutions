'use client';

import { useId, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import { ChartDataTable, ChartLegend, ChartTooltip } from './chart-parts';
import {
  colorAt,
  niceTicks,
  useElementWidth,
  type ChartSeries,
  type ValueFormatter,
} from './chart-utils';

type Point = { x: number; y: number };

/** Monotone cubic interpolation (Fritsch–Carlson): smooth, never overshoots the data. */
export function monotonePath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
  const n = points.length;
  const dx = points.slice(1).map((p, i) => p.x - points[i]!.x);
  const slope = points.slice(1).map((p, i) => (p.y - points[i]!.y) / dx[i]!);
  const tangent = points.map((_, i) => {
    if (i === 0) return slope[0]!;
    if (i === n - 1) return slope[n - 2]!;
    const a = slope[i - 1]!;
    const b = slope[i]!;
    return a * b <= 0
      ? 0
      : (3 * (dx[i - 1]! + dx[i]!)) /
          ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b);
  });
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${p.x + h},${p.y + h * tangent[i]!} ${q.x - h},${q.y - h * tangent[i + 1]!} ${q.x},${q.y}`;
  }
  return d;
}

export interface TrendChartProps<T> {
  data: readonly T[];
  /** Category label for each point (x axis, tooltip title). */
  label: (d: T) => string;
  series: ChartSeries[];
  /** Reads a series value from a datum (default: `d[series.key]`). */
  value?: (d: T, key: string) => number;
  variant?: 'area' | 'line';
  height?: number;
  formatValue?: ValueFormatter;
  formatAxis?: ValueFormatter;
  /** Accessible name of the chart. */
  title: string;
  showLegend?: boolean;
  className?: string;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 48 };

/** The first axis label starts at its point, the last ends there, the others centre on it. */
function edgeAnchor(i: number, count: number): 'start' | 'end' | 'middle' {
  if (i === 0) return 'start';
  return i === count - 1 ? 'end' : 'middle';
}

/** Multi-series area/line chart with grid, axes, legend and a crosshair tooltip. */
export function TrendChart<T>({
  data,
  label,
  series,
  value = (d, key) => Number((d as Record<string, unknown>)[key] ?? 0),
  variant = 'area',
  height = 240,
  formatValue = String,
  formatAxis = formatValue,
  title,
  showLegend = true,
  className,
}: Readonly<TrendChartProps<T>>) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const gradientId = useId().replaceAll(':', '');
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => value(d, s.key))));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xAt = (i: number) => PAD.left + i * step;
  const yAt = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70))));

  return (
    <figure className={cn('relative min-w-0', className)}>
      {showLegend ? (
        <ChartLegend
          className="mb-3"
          items={series.map((s, i) => ({ label: s.label, color: colorAt(i, s.color) }))}
        />
      ) : null}
      <div
        ref={ref}
        className="relative w-full"
        style={{ height }}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && data.length > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={title}
            className="block overflow-visible"
          >
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={colorAt(i, s.color)} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colorAt(i, s.color)} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={yAt(t)}
                  y2={yAt(t)}
                  className="stroke-border"
                  strokeDasharray={t === 0 ? undefined : '3 4'}
                />
                <text
                  x={PAD.left - 8}
                  y={yAt(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-subtle-foreground text-[10px] tabular"
                >
                  {formatAxis(t)}
                </text>
              </g>
            ))}
            {keyed(data, label).map(({ key, item: d }, i) =>
              i % labelEvery === 0 || i === data.length - 1 ? (
                <text
                  key={key}
                  x={xAt(i)}
                  y={height - 6}
                  textAnchor={edgeAnchor(i, data.length)}
                  className="fill-subtle-foreground text-[10px]"
                >
                  {label(d)}
                </text>
              ) : null,
            )}
            {series.map((s, i) => {
              const points = data.map((d, j) => ({ x: xAt(j), y: yAt(value(d, s.key)) }));
              const line = monotonePath(points);
              const color = colorAt(i, s.color);
              return (
                <g key={s.key}>
                  {variant === 'area' ? (
                    <path
                      d={`${line}L${xAt(data.length - 1)},${yAt(0)}L${xAt(0)},${yAt(0)}Z`}
                      fill={`url(#${gradientId}-${i})`}
                    />
                  ) : null}
                  <path
                    d={line}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
            {hover !== null ? (
              <g aria-hidden>
                <line
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  className="stroke-border-strong"
                  strokeDasharray="3 3"
                />
                {series.map((s, i) => (
                  <circle
                    key={s.key}
                    cx={xAt(hover)}
                    cy={yAt(value(data[hover]!, s.key))}
                    r={4}
                    fill={colorAt(i, s.color)}
                    className="stroke-surface"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ) : null}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setHover(
                  Math.min(
                    data.length - 1,
                    Math.max(0, Math.round((e.clientX - box.left) / (step || 1))),
                  ),
                );
              }}
            />
          </svg>
        ) : null}
        {hover !== null && data[hover] ? (
          <ChartTooltip
            x={xAt(hover)}
            y={Math.min(...series.map((s) => yAt(value(data[hover]!, s.key))))}
            containerWidth={width}
            title={label(data[hover]!)}
            rows={series.map((s, i) => ({
              label: s.label,
              value: formatValue(value(data[hover]!, s.key)),
              color: colorAt(i, s.color),
            }))}
          />
        ) : null}
      </div>
      <ChartDataTable
        caption={title}
        headers={['', ...series.map((s) => s.label)]}
        rows={data.map((d) => [label(d), ...series.map((s) => formatValue(value(d, s.key)))])}
      />
    </figure>
  );
}
