'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Sparkline } from '../charts/gauges';
import { DeltaBadge } from './delta';

const TONES = {
  primary: { icon: 'bg-primary-soft text-primary-text', line: 'var(--chart-1)' },
  secondary: { icon: 'bg-secondary-soft text-secondary', line: 'var(--chart-2)' },
  success: { icon: 'bg-success-soft text-success', line: 'var(--success)' },
  warning: { icon: 'bg-warning-soft text-warning', line: 'var(--chart-5)' },
  danger: { icon: 'bg-danger-soft text-danger', line: 'var(--danger)' },
  info: { icon: 'bg-info-soft text-info', line: 'var(--chart-4)' },
} as const;

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof TONES;
  /** Relative change vs the previous period (0.124 = +12.4 %). */
  delta?: number;
  /** "vs last month". */
  deltaLabel?: string;
  /** Whether an increase is good (revenue) or bad (failures, fraud). */
  positiveIsGood?: boolean;
  /** Recent values for the inline sparkline. */
  trend?: number[];
  footer?: ReactNode;
  className?: string;
}

/** KPI tile: value, trend delta (semantic colour), sparkline and optional footer. */
export function KpiCard({
  label,
  value,
  icon,
  tone = 'primary',
  delta,
  deltaLabel,
  positiveIsGood = true,
  trend,
  footer,
  className,
}: Readonly<KpiCardProps>) {
  return (
    <div
      className={cn(
        'group flex flex-col rounded-surface border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-raised',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl leading-tight font-semibold tracking-tight tabular">
            {value}
          </p>
        </div>
        {icon ? (
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-control [&_svg]:size-5',
              TONES[tone].icon,
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        {delta !== undefined ? (
          <p className="flex min-w-0 items-center gap-1.5 text-xs">
            <DeltaBadge value={delta} positiveIsGood={positiveIsGood} />
            {deltaLabel ? (
              <span className="truncate text-subtle-foreground">{deltaLabel}</span>
            ) : null}
          </p>
        ) : (
          <span />
        )}
        {trend ? (
          <Sparkline values={trend} color={TONES[tone].line} width={88} height={30} />
        ) : null}
      </div>
      {footer ? (
        <div className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
