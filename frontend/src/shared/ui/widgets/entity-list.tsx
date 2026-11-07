'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface EntityListItem {
  id: string;
  /** Avatar, IconTile, flag or logo. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Main figure on the end side. */
  value?: ReactNode;
  /** Secondary figure under the value (change, status badge, time). */
  meta?: ReactNode;
  /** Makes the whole row a link. */
  href?: string;
}

/**
 * The most common dashboard list: leading visual, title and subtitle, and a
 * value with a secondary line — top customers, sales by country, upcoming
 * webinars, recent transactions. Pass already-translated, formatted content.
 */
export function EntityList({
  items,
  dividers = false,
  empty,
  className,
}: Readonly<{
  items: EntityListItem[];
  /** Hairlines between rows (dense lists) instead of spacing. */
  dividers?: boolean;
  /** Shown when there are no items. */
  empty?: ReactNode;
  className?: string;
}>) {
  if (!items.length && empty) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className={cn(dividers ? 'divide-y divide-border' : 'space-y-3.5', className)}>
      {items.map((item) => {
        const body = (
          <>
            {item.leading}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              {item.subtitle ? (
                <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              ) : null}
            </div>
            {item.value !== undefined || item.meta ? (
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-end">
                {item.value !== undefined ? (
                  <span className="text-sm font-semibold tabular">{item.value}</span>
                ) : null}
                {item.meta ? (
                  <span className="text-xs text-subtle-foreground">{item.meta}</span>
                ) : null}
              </div>
            ) : null}
          </>
        );
        const row = cn('flex items-center gap-3', dividers && 'py-2.5');
        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  row,
                  '-mx-2 rounded-item px-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {body}
              </Link>
            ) : (
              <div className={row}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
