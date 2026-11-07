'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type StatTone =
  'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ICON: Record<StatTone, string> = {
  primary: 'bg-primary-soft text-primary-text',
  secondary: 'bg-secondary-soft text-secondary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
};

export interface StatItem {
  id: string;
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: StatTone;
  hint?: ReactNode;
}

/**
 * Compact figures in one card, divided by hairlines (Materio profile
 * "Overview"): 2 per row on phones, all in one row from `md`.
 */
export function StatStrip({
  items,
  className,
}: Readonly<{ items: StatItem[]; className?: string }>) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-surface border border-border bg-surface shadow-card md:grid-flow-col md:grid-cols-none md:auto-cols-fr',
        className,
      )}
    >
      {items.map((s, i) => (
        <div
          key={s.id}
          className={cn(
            'flex min-w-0 items-center gap-3 px-4 py-3.5',
            i % 2 === 1 && 'border-s border-border',
            i >= 2 && 'border-t border-border md:border-t-0',
            i > 0 && 'md:border-s',
          )}
        >
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-control [&_svg]:size-5',
              ICON[s.tone ?? 'primary'],
            )}
            aria-hidden
          >
            {s.icon}
          </span>
          {/* dt before dd for assistive tech; the value is shown first. */}
          <div className="flex min-w-0 flex-col">
            <dt className="order-2 truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className="order-1 text-xl leading-tight font-semibold tabular">{s.value}</dd>
            {s.hint ? (
              <dd className="order-3 truncate text-[11px] text-subtle-foreground">{s.hint}</dd>
            ) : null}
          </div>
        </div>
      ))}
    </dl>
  );
}
