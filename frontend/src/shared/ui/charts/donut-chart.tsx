'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { ChartDataTable } from './chart-parts';
import { colorAt, type ValueFormatter } from './chart-utils';

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

/**
 * Donut chart with an interactive legend: hovering a slice or a legend row
 * highlights it and shows its share in the centre.
 */
export function DonutChart({
  data,
  size = 176,
  thickness = 22,
  centerLabel,
  centerValue,
  formatValue = String,
  title,
  legend = 'right',
  className,
}: Readonly<{
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
  centerValue?: ReactNode;
  formatValue?: ValueFormatter;
  title: string;
  legend?: 'right' | 'bottom' | 'none';
  className?: string;
}>) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = data.length > 1 ? 2 : 0; // hairline gap between slices
  let offset = 0;
  const pct = (v: number) => (total ? `${((v / total) * 100).toFixed(1)}%` : '0%');
  const focus = active !== null ? data[active] : null;

  return (
    <figure
      className={cn(
        // Legend below the ring on narrow screens; beside it from `sm` when legend="right".
        'relative flex min-w-0 flex-col items-center gap-6',
        legend === 'right' && 'sm:flex-row',
        className,
      )}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={title}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={thickness}
          />
          {total > 0
            ? data.map((d, i) => {
                const length = (d.value / total) * circumference;
                const dash = Math.max(0, length - gap);
                const el = (
                  <circle
                    key={d.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={colorAt(i, d.color)}
                    strokeWidth={active === i ? thickness + 4 : thickness}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                    opacity={active === null || active === i ? 1 : 0.4}
                    className="cursor-default transition-[opacity,stroke-width] duration-150"
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                  />
                );
                offset += length;
                return el;
              })
            : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl leading-tight font-semibold tabular">
            {focus ? pct(focus.value) : (centerValue ?? formatValue(total))}
          </span>
          <span className="max-w-[70%] truncate text-[11px] text-muted-foreground">
            {focus ? focus.label : centerLabel}
          </span>
        </div>
      </div>
      {legend !== 'none' ? (
        <ul className={cn('w-full min-w-0 flex-1 space-y-1', legend === 'right' && 'sm:w-auto')}>
          {data.map((d, i) => (
            <li
              key={d.label}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              className={cn(
                'flex items-center gap-2.5 rounded-item px-2 py-1 text-xs transition-colors',
                active === i && 'bg-hover',
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-[min(var(--radius-item),4px)]"
                style={{ background: colorAt(i, d.color) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
              <span className="font-semibold tabular">{formatValue(d.value)}</span>
              <span className="w-12 text-end text-subtle-foreground tabular">{pct(d.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ChartDataTable
        caption={title}
        headers={['', 'Value', 'Share']}
        rows={data.map((d) => [d.label, formatValue(d.value), pct(d.value)])}
      />
    </figure>
  );
}
