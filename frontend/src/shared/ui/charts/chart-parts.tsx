'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';

/** Legend chips for multi-series charts. */
export function ChartLegend({
  items,
  className,
}: Readonly<{
  items: Array<{ label: string; color: string; value?: ReactNode }>;
  className?: string;
}>) {
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 shrink-0 rounded-[min(var(--radius-item),4px)]"
            style={{ background: item.color }}
            aria-hidden
          />
          <span>{item.label}</span>
          {item.value !== undefined ? (
            <span className="font-semibold text-foreground tabular">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Floating tooltip positioned inside a relative chart container. */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  title,
  rows,
}: Readonly<{
  x: number;
  y: number;
  containerWidth: number;
  title: ReactNode;
  rows: Array<{ label: string; value: ReactNode; color?: string }>;
}>) {
  // Flip to the left of the pointer near the right edge.
  const flip = x > containerWidth - 180;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-40 rounded-surface border border-border bg-surface/95 px-3 py-2 text-xs shadow-overlay backdrop-blur-sm"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? containerWidth - x + 12 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      <p className="mb-1 font-semibold text-foreground">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-4 text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              {r.color ? (
                <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
              ) : null}
              {r.label}
            </span>
            <span className="font-semibold text-foreground tabular">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Visually hidden data table: the text alternative for a chart (WCAG 1.1.1). */
export function ChartDataTable({
  caption,
  headers,
  rows,
}: Readonly<{
  caption: string;
  headers: string[];
  rows: string[][];
}>) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keyed(rows, (r) => r[0] ?? '').map(({ key, item }) => (
          <DataRow key={key} cells={item} headers={headers} />
        ))}
      </tbody>
    </table>
  );
}

/** One data row: the first cell heads the row; cells are keyed by their column. */
function DataRow({ cells, headers }: Readonly<{ cells: string[]; headers: string[] }>) {
  const columns = keyed(
    cells.map((value, j) => ({ value, column: headers[j] ?? '' })),
    (c) => c.column,
  );
  return (
    <tr>
      {columns.map(({ key, item }, j) =>
        j === 0 ? (
          <th key={key} scope="row">
            {item.value}
          </th>
        ) : (
          <td key={key}>{item.value}</td>
        ),
      )}
    </tr>
  );
}
