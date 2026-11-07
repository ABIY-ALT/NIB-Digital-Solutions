'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface CompactColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'start' | 'end' | 'center';
  /** The row's name for screen readers (rendered as a row header). One column per table. */
  rowHeader?: boolean;
  /** Hidden below this breakpoint to keep narrow cards readable. */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ALIGN = { start: 'text-start', end: 'text-end', center: 'text-center' } as const;
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

/**
 * A read-only table for a dashboard card (recent orders, top pages, vehicles).
 * No sorting or paging — link to the full list for that; use DataTable for
 * real data management.
 */
export function CompactTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  className,
}: Readonly<{
  /** Accessible caption (visually hidden). */
  caption: string;
  columns: CompactColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
}>) {
  if (!rows.length && empty) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted text-xs text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={cn(
                  'px-4 py-2.5 font-semibold whitespace-nowrap first:ps-5 last:pe-5',
                  ALIGN[c.align ?? 'start'],
                  c.hideBelow && HIDE[c.hideBelow],
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-hover">
              {columns.map((c) => {
                const Cell = c.rowHeader ? 'th' : 'td';
                return (
                  <Cell
                    key={c.id}
                    {...(c.rowHeader ? { scope: 'row' } : {})}
                    className={cn(
                      'px-4 py-2.5 font-normal first:ps-5 last:pe-5',
                      ALIGN[c.align ?? 'start'],
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
