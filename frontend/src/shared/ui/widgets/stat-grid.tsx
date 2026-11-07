'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { DeltaBadge } from './delta';
import { TONE_SOFT, type WidgetTone } from './tones';

export interface StatGridItem {
  id: string;
  label: ReactNode;
  value: ReactNode;
  icon: ReactNode;
  tone?: WidgetTone;
  /** Relative change vs the previous period. */
  delta?: number;
  positiveIsGood?: boolean;
}

/** Icon tile used by lists and stat grids. */
export function IconTile({
  icon,
  tone = 'primary',
  size = 40,
  className,
}: Readonly<{
  icon: ReactNode;
  tone?: WidgetTone;
  size?: number;
  className?: string;
}>) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-control [&_svg]:size-[45%]',
        TONE_SOFT[tone],
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {icon}
    </span>
  );
}

const COLUMNS = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
} as const;

/**
 * A compact grid of figures with icons ("Sales 245k · Customers 12.5k · …"),
 * for a summary card. Each cell is a term/description pair for screen readers.
 */
export function StatGrid({
  items,
  columns = 4,
  className,
}: Readonly<{
  items: StatGridItem[];
  columns?: keyof typeof COLUMNS;
  className?: string;
}>) {
  return (
    <dl className={cn('grid gap-x-4 gap-y-5', COLUMNS[columns], className)}>
      {items.map((item) => (
        <div key={item.id} className="flex min-w-0 items-center gap-3">
          <IconTile icon={item.icon} tone={item.tone} size={42} />
          <div className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
            <dd className="flex flex-wrap items-center gap-x-1.5 text-lg leading-tight font-semibold tabular">
              {item.value}
              {item.delta !== undefined ? (
                <DeltaBadge
                  value={item.delta}
                  positiveIsGood={item.positiveIsGood}
                  variant="text"
                />
              ) : null}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
