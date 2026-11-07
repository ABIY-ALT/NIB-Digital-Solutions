'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export type DeltaDirection = 'up' | 'down' | 'flat';

/** Direction of a relative change; changes under 0.05 % count as flat. */
export function deltaDirection(delta: number | undefined): DeltaDirection {
  if (delta === undefined || !Number.isFinite(delta) || Math.abs(delta) < 0.0005) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/** Relative change between two values (0 when there is no previous value). */
export function relativeChange(current: number, previous: number): number {
  return previous ? (current - previous) / Math.abs(previous) : 0;
}

const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

/** Colours by meaning, per variant. */
const DELTA_TONE = {
  pill: {
    good: 'bg-success-soft text-success',
    bad: 'bg-danger-soft text-danger',
    neutral: 'bg-muted text-muted-foreground',
  },
  text: { good: 'text-success', bad: 'text-danger', neutral: 'text-muted-foreground' },
} as const;

/** Whether a change is good news: depends on which direction is the good one. */
function deltaMeaning(direction: DeltaDirection, positiveIsGood: boolean) {
  if (direction === 'flat') return 'neutral';
  return (direction === 'up') === positiveIsGood ? 'good' : 'bad';
}

/**
 * Change indicator: "▲ 12.4 %" coloured by meaning, not by sign — an increase
 * in failures is bad (positiveIsGood={false}).
 *   pill  tinted chip (KPI cards)
 *   text  coloured text only (dense lists and tables)
 */
export function DeltaBadge({
  value,
  positiveIsGood = true,
  variant = 'pill',
  digits = 1,
  className,
}: Readonly<{
  /** Relative change: 0.124 = +12.4 %. */
  value: number;
  positiveIsGood?: boolean;
  variant?: 'pill' | 'text';
  digits?: number;
  className?: string;
}>) {
  const direction = deltaDirection(value);
  const Icon = DELTA_ICON[direction];
  const tone = DELTA_TONE[variant][deltaMeaning(direction, positiveIsGood)];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 font-semibold tabular',
        variant === 'pill' ? 'rounded-pill px-1.5 py-0.5 text-xs' : 'text-[11px]',
        tone,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {`${Math.abs(value * 100).toFixed(digits)}%`}
    </span>
  );
}
