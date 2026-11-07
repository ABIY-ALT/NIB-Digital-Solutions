'use client';

import { Clock } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface TaskItem {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned emphasis (e.g. amount). */
  value?: ReactNode;
  priority: 'high' | 'medium' | 'low';
  /** SLA deadline. */
  dueAt: Date;
}

export interface TaskListLabels {
  priority: Record<TaskItem['priority'], string>;
  dueIn: (time: string) => string;
  overdue: (time: string) => string;
}

const PRIORITY = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warning-soft text-warning',
  low: 'bg-muted text-muted-foreground',
} as const;

/** "2h 05m" / "35m" / "3d 4h" */
export function formatDuration(ms: number): string {
  const m = Math.floor(Math.abs(ms) / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(mm).padStart(2, '0')}m`;
  return `${mm}m`;
}

/** Countdown colour: unknown time muted, overdue red, due within the hour amber. */
function dueTone(left: number | null): string {
  if (left === null) return 'text-subtle-foreground';
  if (left < 0) return 'text-danger';
  return left < 3_600_000 ? 'text-warning' : 'text-muted-foreground';
}

function dueText(left: number | null, labels: Pick<TaskListLabels, 'overdue' | 'dueIn'>): string {
  if (left === null) return '—';
  return left < 0 ? labels.overdue(formatDuration(left)) : labels.dueIn(formatDuration(left));
}
/**
 * Work queue (e.g. maker–checker approvals): priority chip, SLA countdown that
 * turns amber under 1 h and red when overdue, and per-item actions.
 */
export function TaskList({
  items,
  labels,
  renderActions,
  className,
}: Readonly<{
  items: TaskItem[];
  labels: TaskListLabels;
  renderActions?: (item: TaskItem) => ReactNode;
  className?: string;
}>) {
  // Client-only clock (null during SSR → no countdown text mismatch).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <ul className={cn('divide-y divide-border', className)}>
      {items.map((it) => {
        const left = now === null ? null : it.dueAt.getTime() - now;
        const tone = dueTone(left);
        return (
          <li
            key={it.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
          >
            <span
              className={cn(
                'rounded-pill px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                PRIORITY[it.priority],
              )}
            >
              {labels.priority[it.priority]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{it.title}</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {it.subtitle ? <span className="truncate">{it.subtitle}</span> : null}
                <span className={cn('inline-flex shrink-0 items-center gap-1 font-medium', tone)}>
                  <Clock className="size-3" aria-hidden />
                  {dueText(left, labels)}
                </span>
              </p>
            </div>
            {it.value !== undefined ? (
              <span className="text-sm font-semibold tabular">{it.value}</span>
            ) : null}
            {renderActions ? (
              <div className="flex shrink-0 gap-1.5">{renderActions(it)}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
