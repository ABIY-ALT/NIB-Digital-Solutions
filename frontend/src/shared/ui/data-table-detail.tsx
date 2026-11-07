import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Skeleton } from './feedback';

/**
 * Content for an expanded DataTable row (master–detail):
 *
 *   <DataTable
 *     …
 *     expansion={{
 *       render: (order) => (
 *         <DetailPanel title="Items" actions={<Button size="sm">Add item</Button>}>
 *           <OrderLines orderId={order.id} />     // fetches its own data, see below
 *         </DetailPanel>
 *       ),
 *     }}
 *   />
 *
 *   function OrderLines({ orderId }: { orderId: string }) {
 *     const { data, isPending, error } = useOrderLines(orderId);   // runs only while expanded
 *     return <SubTable columns={…} data={data ?? []} getRowId={(l) => l.id}
 *                      loading={isPending} error={error ? <ErrorState … /> : undefined} />;
 *   }
 *
 * The detail is mounted only while its row is expanded, so a component that
 * loads data in it fetches lazily, per row, and TanStack Query caches it.
 */
export function DetailPanel({
  title,
  description,
  actions,
  className,
  children,
}: Readonly<{
  title?: ReactNode;
  description?: ReactNode;
  /** Buttons aligned with the title (e.g. "Add item"). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div className={cn('space-y-3 px-[var(--cell-padding-x)] py-4', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : null}
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export interface SubTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: 'start' | 'center' | 'end';
  width?: number | string;
  className?: string;
}

const alignClass = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;

/**
 * Compact read-only table for the child records of a row (order lines, role
 * permissions, account signatories). For child records that need sorting,
 * paging or selection of their own, render a full DataTable in the detail
 * instead.
 */
export function SubTable<T>({
  columns,
  data,
  getRowId,
  caption,
  loading,
  error,
  emptyText,
  footer,
  skeletonRows = 3,
  className,
}: Readonly<{
  columns: Array<SubTableColumn<T>>;
  data: readonly T[];
  getRowId: (row: T, index: number) => string;
  /** Accessible name of the table (visually hidden). */
  caption?: string;
  loading?: boolean;
  /** Error content rendered in place of rows. */
  error?: ReactNode;
  emptyText?: ReactNode;
  /** Totals: rendered right-aligned under the rows. */
  footer?: ReactNode;
  skeletonRows?: number;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'scrollbar-thin overflow-x-auto rounded-control border border-border bg-surface',
        className,
      )}
    >
      <table className="w-full min-w-max border-collapse text-sm" aria-busy={loading || undefined}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'border-b border-border px-3 py-2 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase',
                  alignClass[col.align ?? 'start'],
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SubTableRows
            columns={columns}
            data={data}
            getRowId={getRowId}
            loading={loading}
            error={error}
            emptyText={emptyText}
            skeletonRows={skeletonRows}
          />
        </tbody>
      </table>
      {footer && !loading && !error ? (
        <div className="flex justify-end border-t border-border bg-surface-muted px-3 py-2.5 text-sm">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** The body rows: skeletons while loading, then the error, the empty text or the data. */
function SubTableRows<T>({
  columns,
  data,
  getRowId,
  loading,
  error,
  emptyText,
  skeletonRows,
}: Readonly<{
  columns: Array<SubTableColumn<T>>;
  data: readonly T[];
  getRowId: (row: T, index: number) => string;
  loading?: boolean;
  error?: ReactNode;
  emptyText?: ReactNode;
  skeletonRows: number;
}>) {
  if (loading) {
    return Array.from({ length: skeletonRows }, (_, i) => (
      <tr key={`sk-${i}`} className="border-b border-border last:border-0">
        {columns.map((col, j) => (
          <td key={col.id} className="px-3 py-2">
            <Skeleton className="h-3.5" style={{ width: `${45 + ((i * 11 + j * 17) % 45)}%` }} />
          </td>
        ))}
      </tr>
    ));
  }
  if (error) {
    return (
      <tr>
        <td colSpan={columns.length}>{error}</td>
      </tr>
    );
  }
  if (data.length === 0) {
    return (
      <tr>
        <td
          colSpan={columns.length}
          className="px-3 py-5 text-center text-sm text-muted-foreground"
        >
          {emptyText}
        </td>
      </tr>
    );
  }
  return data.map((row, index) => (
    <tr key={getRowId(row, index)} className="border-b border-border last:border-0">
      {columns.map((col) => (
        <td
          key={col.id}
          className={cn(
            'px-3 py-2 align-middle text-foreground',
            alignClass[col.align ?? 'start'],
            col.className,
          )}
        >
          {col.cell(row, index)}
        </td>
      ))}
    </tr>
  ));
}
