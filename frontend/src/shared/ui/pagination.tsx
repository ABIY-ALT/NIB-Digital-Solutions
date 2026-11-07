'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import type { PaginationMeta } from '@/shared/types';
import { fieldVariants, useFieldAppearance } from './input';
import { useUiSettings } from './ui-settings';

/**
 * Server-side pagination controls. The component never slices data: it shows
 * the page the server returned (`pagination` = the response's meta.pagination)
 * and reports what the user asked for; the caller puts that in the URL
 * (useListParams) and the list hook fetches the page.
 *
 *   <Pagination pagination={data.pagination} labels={labels}
 *     onPageChange={(page) => update({ page }, false)}
 *     onPageSizeChange={(pageSize) => update({ pageSize })} />
 *
 * Product defaults come from app.config `ui.pagination` (page sizes, first/last
 * buttons, how many page numbers); each prop overrides them for one list.
 * <DataTable> renders this for you — use it directly for card lists and feeds.
 */
export interface PaginationLabels {
  showing: (from: number, to: number, total: number) => string;
  perPage: string;
  first: string;
  previous: string;
  next: string;
  last: string;
  page: (page: number) => string;
}

export interface PaginationProps {
  /** The server's pagination meta for the page on screen. */
  pagination: PaginationMeta;
  labels: PaginationLabels;
  onPageChange?: (page: number) => void;
  /** Omit to hide the rows-per-page select. */
  onPageSizeChange?: (pageSize: number) => void;
  /** Rows-per-page choices for this list (default: app.config `ui.pagination.pageSizeOptions`). */
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  showFirstLast?: boolean;
  /** Page numbers shown on each side of the current page. */
  siblings?: number;
  className?: string;
}

/** Page numbers to show: first, last, the current page ± siblings, and gaps between. */
export function pageNumbers(current: number, total: number, siblings = 1): Array<number | 'gap'> {
  if (total <= 5 + 2 * siblings) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | 'gap'> = [1];
  const start = Math.max(2, current - siblings);
  const end = Math.min(total - 1, current + siblings);
  if (start > 2) pages.push('gap');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('gap');
  pages.push(total);
  return pages;
}

/** The size choices offered, always including the size in use (e.g. one set by URL). */
export function pageSizeChoices(options: number[], current: number): number[] {
  return [...new Set([...options, current])].filter((n) => n > 0).sort((a, b) => a - b);
}

const BUTTON =
  'inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-control border border-border bg-surface px-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring outline-none';

export function Pagination({
  pagination,
  labels,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  showPageSize,
  showFirstLast,
  siblings,
  className,
}: Readonly<PaginationProps>) {
  const { pagination: settings } = useUiSettings();
  const appearance = useFieldAppearance();
  const { page, pageSize, totalItems, totalPages } = pagination;
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const firstLast = showFirstLast ?? settings.showFirstLast;
  const sizes = pageSizeChoices(pageSizeOptions ?? settings.pageSizeOptions, pageSize);

  // A page past the end (rows deleted, a filter narrowed the list, a stale link): go to the last one.
  const outOfRange = totalItems > 0 && page > totalPages;
  useEffect(() => {
    if (outOfRange) onPageChange?.(totalPages);
  }, [outOfRange, totalPages, onPageChange]);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap" aria-live="polite">
          {labels.showing(from, to, totalItems)}
        </span>
        {onPageSizeChange && (showPageSize ?? settings.showPageSize) ? (
          <label className="flex items-center gap-1.5">
            <span className="sr-only">{labels.perPage}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className={cn(fieldVariants({ appearance }), 'h-[30px] w-auto px-2 text-xs')}
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s} / {labels.perPage}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {onPageChange && totalPages > 1 ? (
        <div className="flex items-center gap-0.5">
          {firstLast ? (
            <button
              type="button"
              className={BUTTON}
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
              aria-label={labels.first}
            >
              <ChevronsLeft className="size-3.5 rtl:rotate-180" />
            </button>
          ) : null}
          <button
            type="button"
            className={BUTTON}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={labels.previous}
          >
            <ChevronLeft className="size-3.5 rtl:rotate-180" />
          </button>
          {keyed(pageNumbers(page, totalPages, siblings ?? settings.siblings), String).map(
            ({ key, item: p }) =>
              p === 'gap' ? (
                <span key={key} className="inline-flex w-[30px] justify-center" aria-hidden>
                  …
                </span>
              ) : (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    BUTTON,
                    p === page &&
                      'border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground',
                  )}
                  aria-current={p === page ? 'page' : undefined}
                  aria-label={labels.page(p)}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              ),
          )}
          <button
            type="button"
            className={BUTTON}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={labels.next}
          >
            <ChevronRight className="size-3.5 rtl:rotate-180" />
          </button>
          {firstLast ? (
            <button
              type="button"
              className={BUTTON}
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
              aria-label={labels.last}
            >
              <ChevronsRight className="size-3.5 rtl:rotate-180" />
            </button>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
