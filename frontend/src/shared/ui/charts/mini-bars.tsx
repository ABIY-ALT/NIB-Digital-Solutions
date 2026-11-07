'use client';

import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import { colorAt } from './chart-utils';

export interface MiniBar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bar geometry for MiniBars: equal widths, `gap` px apart, heights relative to the maximum. */
export function layoutMiniBars(
  values: readonly number[],
  width: number,
  height: number,
  gap = 4,
): MiniBar[] {
  if (!values.length || width <= 0 || height <= 0) return [];
  const max = Math.max(...values, 0) || 1;
  const barWidth = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  return values.map((v, i) => {
    const h = Math.max(2, (Math.max(0, v) / max) * height);
    return { x: i * (barWidth + gap), y: height - h, width: barWidth, height: h };
  });
}

/** The bar to emphasise; -1 shows every bar at full strength. */
function highlightIndex(values: number[], highlight: 'max' | 'last' | 'none' | number): number {
  if (highlight === 'max') return values.indexOf(Math.max(...values));
  if (highlight === 'last') return values.length - 1;
  return highlight === 'none' ? -1 : highlight;
}

/**
 * Column sparkline for compact cards ("Weekly sales", "Total profit"). One bar
 * is highlighted (the maximum, the latest, or an index); the rest are muted.
 * Decorative: pair it with the figure it illustrates.
 */
export function MiniBars({
  values,
  width = 120,
  height = 48,
  gap = 4,
  highlight = 'max',
  color = colorAt(0),
  className,
}: Readonly<{
  values: number[];
  width?: number;
  height?: number;
  gap?: number;
  highlight?: 'max' | 'last' | 'none' | number;
  color?: string;
  className?: string;
}>) {
  const bars = layoutMiniBars(values, width, height, gap);
  const hi = highlightIndex(values, highlight);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      {keyed(bars, (b) => String(b.x)).map(({ key, item: b }, i) => (
        <rect
          key={key}
          x={b.x}
          y={b.y}
          width={b.width}
          height={b.height}
          rx={Math.min(3, b.width / 2)}
          fill={color}
          opacity={i === hi || hi === -1 ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}
