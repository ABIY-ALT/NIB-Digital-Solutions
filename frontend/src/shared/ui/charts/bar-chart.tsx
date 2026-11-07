'use client';

import { useState } from 'react';
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

export interface BarChartProps<T> {
  data: readonly T[];
  label: (d: T) => string;
  series: ChartSeries[];
  value?: (d: T, key: string) => number;
  /** Side by side (grouped) or on top of each other (stacked). */
  mode?: 'grouped' | 'stacked';
  height?: number;
  formatValue?: ValueFormatter;
  formatAxis?: ValueFormatter;
  title: string;
  showLegend?: boolean;
  className?: string;
}

const PAD = { top: 12, right: 8, bottom: 24, left: 48 };

/** Vertical bar chart (grouped or stacked) with rounded-item tops, tooltip and legend. */
export function BarChart<T>({
  data,
  label,
  series,
  value = (d, key) => Number((d as Record<string, unknown>)[key] ?? 0),
  mode = 'grouped',
  height = 240,
  formatValue = String,
  formatAxis = formatValue,
  title,
  showLegend = true,
  className,
}: Readonly<BarChartProps<T>>) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const totals = data.map((d) => series.reduce((sum, s) => sum + value(d, s.key), 0));
  const max =
    mode === 'stacked'
      ? Math.max(0, ...totals)
      : Math.max(0, ...data.flatMap((d) => series.map((s) => value(d, s.key))));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = data.length ? innerW / data.length : 0;
  const barGroup = band * 0.64;
  const barW = mode === 'stacked' ? barGroup : barGroup / series.length;
  const yAt = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 56))));

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
          <svg width={width} height={height} role="img" aria-label={title} className="block">
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
            {keyed(data, label).map(({ key, item: d }, i) => {
              const x0 = PAD.left + i * band + (band - barGroup) / 2;
              let stackTop = 0;
              return (
                <g key={key} onPointerEnter={() => setHover(i)} className="cursor-default">
                  <rect
                    x={PAD.left + i * band}
                    y={PAD.top}
                    width={band}
                    height={innerH}
                    className={hover === i ? 'fill-hover' : 'fill-transparent'}
                  />
                  {series.map((s, si) => {
                    const v = value(d, s.key);
                    const h = (v / top) * innerH;
                    const x = mode === 'stacked' ? x0 : x0 + si * barW;
                    const y = mode === 'stacked' ? yAt(stackTop + v) : yAt(v);
                    stackTop += mode === 'stacked' ? v : 0;
                    const isTop = mode === 'grouped' || si === series.length - 1;
                    const r = Math.min(3, barW / 2, h);
                    // Rounded top corners only (flat base / flat joins inside a stack).
                    const path =
                      isTop && h > 0
                        ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + h}Z`
                        : `M${x},${y + h}V${y}H${x + barW}V${y + h}Z`;
                    return (
                      <path
                        key={s.key}
                        d={path}
                        fill={colorAt(si, s.color)}
                        opacity={hover === null || hover === i ? 1 : 0.55}
                        className="transition-opacity"
                      />
                    );
                  })}
                  {i % labelEvery === 0 ? (
                    <text
                      x={PAD.left + i * band + band / 2}
                      y={height - 6}
                      textAnchor="middle"
                      className="fill-subtle-foreground text-[10px]"
                    >
                      {label(d)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
        {hover !== null && data[hover] ? (
          <ChartTooltip
            x={PAD.left + hover * band + band / 2}
            y={yAt(
              mode === 'stacked'
                ? totals[hover]!
                : Math.max(...series.map((s) => value(data[hover]!, s.key))),
            )}
            containerWidth={width}
            title={label(data[hover]!)}
            rows={[
              ...series.map((s, i) => ({
                label: s.label,
                value: formatValue(value(data[hover]!, s.key)),
                color: colorAt(i, s.color),
              })),
              ...(mode === 'stacked' && series.length > 1
                ? [{ label: 'Σ', value: formatValue(totals[hover]!) }]
                : []),
            ]}
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
