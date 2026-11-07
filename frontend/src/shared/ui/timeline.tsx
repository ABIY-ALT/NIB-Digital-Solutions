'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { Skeleton } from './feedback';

export type TimelineTone =
  'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const DOT: Record<TimelineTone, string> = {
  primary: 'bg-primary-soft text-primary-text ring-primary/30',
  secondary: 'bg-secondary-soft text-secondary ring-secondary/30',
  success: 'bg-success-soft text-success ring-success/30',
  warning: 'bg-warning-soft text-warning ring-warning/30',
  danger: 'bg-danger-soft text-danger ring-danger/30',
  info: 'bg-info-soft text-info ring-info/30',
  neutral: 'bg-muted text-muted-foreground ring-border-strong',
};

export interface TimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned time (e.g. <RelativeTime />). */
  time?: ReactNode;
  icon?: ReactNode;
  tone?: TimelineTone;
  /** Extra content under the description (chips, attachments, links). */
  extra?: ReactNode;
  /** Group heading key (e.g. the calendar day); consecutive items share one heading. */
  group?: string;
}

/**
 * Vertical activity timeline (Materio "Activity Timeline"): tone-coloured
 * icons on a rail, optional day headings, loading rows and "load more".
 * Reusable for personal activity, approval history, case notes, audit trails.
 */
export function Timeline({
  items,
  loading,
  empty,
  hasMore,
  loadingMore,
  onLoadMore,
  loadMoreLabel = 'Load more',
  className,
}: Readonly<{
  items: TimelineItem[];
  loading?: boolean;
  empty?: ReactNode;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
  className?: string;
}>) {
  if (loading) {
    return (
      <div className={cn('space-y-5', className)} aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) return <>{empty}</>;

  return (
    <div className={className}>
      <ol className="relative">
        {items.map((item, index) => {
          const heading = item.group && item.group !== items[index - 1]?.group ? item.group : null;
          const last = index === items.length - 1;
          return (
            <li key={item.id}>
              {heading ? (
                <div className="mb-3 ms-11 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase first:mt-0 [&:not(:first-child)]:mt-1">
                  {heading}
                </div>
              ) : null}
              <div className="relative flex gap-3 pb-5">
                {!last ? (
                  <span
                    className="absolute start-4 top-9 bottom-1 w-px -translate-x-1/2 bg-border rtl:translate-x-1/2"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    'relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface [&_svg]:size-4',
                    DOT[item.tone ?? 'neutral'],
                  )}
                  aria-hidden
                >
                  {item.icon ?? <span className="size-2 rounded-full bg-current" />}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="min-w-0 text-sm font-semibold">{item.title}</p>
                    {item.time ? (
                      <span className="shrink-0 text-xs text-subtle-foreground">{item.time}</span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{item.description}</p>
                  ) : null}
                  {item.extra ? <div className="mt-2">{item.extra}</div> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {hasMore && onLoadMore ? (
        <div className="ms-11">
          <Button variant="outline" size="sm" onClick={onLoadMore} loading={loadingMore}>
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
