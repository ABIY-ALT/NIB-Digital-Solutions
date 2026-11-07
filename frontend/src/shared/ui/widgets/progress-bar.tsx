'use client';

import { cn } from '@/shared/lib/cn';
import { TONE_FILL, type WidgetTone } from './tones';

/** Clamps a ratio to [0, 1] (NaN → 0). */
export function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

/**
 * Thin horizontal progress bar (course progress, stock level, route completion).
 * `label` names it for screen readers; the visible number is up to the caller.
 */
export function ProgressBar({
  value,
  tone = 'primary',
  size = 'sm',
  label,
  className,
}: Readonly<{
  /** Ratio 0–1. */
  value: number;
  tone?: WidgetTone;
  size?: 'xs' | 'sm' | 'md';
  label: string;
  className?: string;
}>) {
  const ratio = clampRatio(value);
  return (
    <div className={cn('w-full overflow-hidden rounded-pill bg-muted', HEIGHT[size], className)}>
      {/* The bar is drawn; assistive technology reads this native progress element. */}
      <progress className="sr-only" aria-label={label} max={100} value={Math.round(ratio * 100)} />
      <div
        className={cn(
          'h-full rounded-pill transition-[width] duration-700 ease-out',
          TONE_FILL[tone],
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
