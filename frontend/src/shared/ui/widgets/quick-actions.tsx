'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  /** Navigate… */
  href?: string;
  /** …or run an action. */
  onSelect?: () => void;
  /** Small counter (e.g. pending approvals). */
  badge?: ReactNode;
  tone?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'danger';
  /** Hide when the user lacks permission (filter before passing, or set this). */
  hidden?: boolean;
}

const TONES = {
  primary: 'bg-primary-soft text-primary-text',
  secondary: 'bg-secondary-soft text-secondary',
  success: 'bg-success-soft text-success',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
} as const;

/** Shortcut tiles for frequent tasks (links or actions), with optional counters. */
export function QuickActions({
  actions,
  columns = 3,
  className,
}: Readonly<{
  actions: QuickAction[];
  columns?: 2 | 3 | 4;
  className?: string;
}>) {
  const visible = actions.filter((a) => !a.hidden);
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4' }[
    columns
  ];
  return (
    <ul className={cn('grid grid-cols-1 gap-3', grid, className)}>
      {visible.map((a) => {
        const body = (
          <>
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-control [&_svg]:size-5',
                TONES[a.tone ?? 'primary'],
              )}
            >
              {a.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="truncate">{a.label}</span>
                {a.badge !== undefined ? (
                  <span className="rounded-pill bg-danger px-1.5 text-[10px] leading-4 font-bold text-danger-foreground tabular">
                    {a.badge}
                  </span>
                ) : null}
              </span>
              {a.description ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {a.description}
                </span>
              ) : null}
            </span>
            <ArrowUpRight
              className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-text rtl:-scale-x-100"
              aria-hidden
            />
          </>
        );
        const cls =
          'group flex w-full items-center gap-3 rounded-surface border border-border bg-surface p-3 text-start shadow-card outline-none transition-all hover:-translate-y-px hover:border-primary/50 hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring';
        return (
          <li key={a.id}>
            {a.href ? (
              <Link href={a.href} className={cls}>
                {body}
              </Link>
            ) : (
              <button type="button" onClick={a.onSelect} className={cls}>
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
