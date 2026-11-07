'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { ChartDataTable, ChartLegend, ChartTooltip } from './chart-parts';
import { niceTicks, useElementWidth, type ValueFormatter } from './chart-utils';

export interface WaterfallStep {
  label: string;
  /** Change for a step; the absolute level for a `total` bar. */
  value: number;
  /** Totals (opening/closing balance) are drawn from zero. */
  total?: boolean;
}

export interface WaterfallBar extends WaterfallStep {
  start: number;
  end: number;
  kind: 'total' | 'up' | 'down';
}

/** Cumulative layout: each change floats from the previous level; totals reset the level. */
export function layoutWaterfall(steps: readonly WaterfallStep[]): WaterfallBar[] {
  let level = 0;
  return steps.map((s) => {
    if (s.total) {
      level = s.value;
      return { ...s, start: 0, end: s.value, kind: 'total' };
    }
    const start = level;
    level += s.value;
    return { ...s, start, end: level, kind: s.value >= 0 ? 'up' : 'down' };
  });
}

const COLORS = { total: 'var(--chart-1)', up: 'var(--success)', down: 'var(--danger)' } as const;
/** Fill of a bar's value label: decreases red, increases green, totals plain. */
const VALUE_FILL = { total: 'fill-foreground', up: 'fill-success', down: 'fill-danger' } as const;
const PAD = { top: 16, right: 8, bottom: 40, left: 52 };

/**
 * Waterfall chart: how an opening value becomes a closing value through
 * increases (green) and decreases (red), with connector lines between bars.
 */
export function WaterfallChart({
  steps,
  height = 260,
  formatValue = String,
  formatAxis = formatValue,
  title,
  labels = { total: 'Total', increase: 'Increase', decrease: 'Decrease' },
  className,
}: Readonly<{
  steps: readonly WaterfallStep[];
  height?: number;
  formatValue?: ValueFormatter;
  formatAxis?: ValueFormatter;
  title: string;
  labels?: { total: string; increase: string; decrease: string };
  className?: string;
}>) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const bars = layoutWaterfall(steps);
  const ticks = niceTicks(Math.max(0, ...bars.map((b) => Math.max(b.start, b.end))));
  const top = ticks.at(-1)!;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = bars.length ? innerW / bars.length : 0;
  const barW = Math.min(56, band * 0.62);
  const yAt = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const xAt = (i: number) => PAD.left + i * band + (band - barW) / 2;

  return (
    <figure className={cn('relative min-w-0', className)}>
      <ChartLegend
        className="mb-3"
        items={[
          { label: labels.total, color: COLORS.total },
          { label: labels.increase, color: COLORS.up },
          { label: labels.decrease, color: COLORS.down },
        ]}
      />
      <div
        ref={ref}
        className="relative w-full"
        style={{ height }}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 ? (
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
            {bars.map((b, i) => {
              const y = yAt(Math.max(b.start, b.end));
              const h = Math.max(1, Math.abs(yAt(b.start) - yAt(b.end)));
              const next = bars[i + 1];
              return (
                <g key={b.label} onPointerEnter={() => setHover(i)}>
                  <rect
                    x={PAD.left + i * band}
                    y={PAD.top}
                    width={band}
                    height={innerH}
                    className={hover === i ? 'fill-hover' : 'fill-transparent'}
                  />
                  <rect
                    x={xAt(i)}
                    y={y}
                    width={barW}
                    height={h}
                    rx={Math.min(3, barW / 4)}
                    fill={COLORS[b.kind]}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                    className="transition-opacity"
                  />
                  {next && !next.total ? (
                    <line
                      x1={xAt(i) + barW}
                      x2={xAt(i + 1)}
                      y1={yAt(b.end)}
                      y2={yAt(b.end)}
                      className="stroke-border-strong"
                      strokeDasharray="2 3"
                    />
                  ) : null}
                  <text
                    x={PAD.left + i * band + band / 2}
                    y={height - 22}
                    textAnchor="middle"
                    className="fill-subtle-foreground text-[10px]"
                  >
                    {b.label.length > 14 ? `${b.label.slice(0, 13)}…` : b.label}
                  </text>
                  <text
                    x={PAD.left + i * band + band / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className={cn('text-[10px] font-semibold tabular', VALUE_FILL[b.kind])}
                  >
                    {b.kind === 'up' ? '+' : ''}
                    {formatAxis(b.kind === 'total' ? b.end : b.value)}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : null}
        {hover !== null && bars[hover] ? (
          <ChartTooltip
            x={xAt(hover) + barW / 2}
            y={yAt(Math.max(bars[hover]!.start, bars[hover]!.end))}
            containerWidth={width}
            title={bars[hover]!.label}
            rows={[
              {
                label: { total: labels.total, up: labels.increase, down: labels.decrease }[
                  bars[hover]!.kind
                ],
                value: formatValue(
                  bars[hover]!.kind === 'total' ? bars[hover]!.end : bars[hover]!.value,
                ),
                color: COLORS[bars[hover]!.kind],
              },
              ...(bars[hover]!.kind === 'total'
                ? []
                : [{ label: '→', value: formatValue(bars[hover]!.end) }]),
            ]}
          />
        ) : null}
      </div>
      <ChartDataTable
        caption={title}
        headers={['', 'Value']}
        rows={bars.map((b) => [b.label, formatValue(b.kind === 'total' ? b.end : b.value)])}
      />
    </figure>
  );
}
