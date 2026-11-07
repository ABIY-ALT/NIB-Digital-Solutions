'use client';

import { Check, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface ChecklistItem {
  id: string;
  label: string;
  description?: ReactNode;
  done: boolean;
  /** Relative importance in the score (default 1). */
  weight?: number;
  /** Fix-it link or handler shown while the item is not done. */
  action?: { label: string; href?: string; onClick?: () => void };
}

export interface ChecklistLevel {
  /** Lowest percentage for this level. */
  min: number;
  label: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
}

const TONE = {
  danger: { stroke: 'stroke-danger', text: 'text-danger', soft: 'bg-danger-soft' },
  warning: { stroke: 'stroke-warning', text: 'text-warning', soft: 'bg-warning-soft' },
  info: { stroke: 'stroke-info', text: 'text-info', soft: 'bg-info-soft' },
  success: { stroke: 'stroke-success', text: 'text-success', soft: 'bg-success-soft' },
} as const;

/** Weighted completion (0–100). */
export function checklistScore(items: readonly ChecklistItem[]): number {
  const total = items.reduce((n, i) => n + (i.weight ?? 1), 0);
  if (total === 0) return 100;
  const done = items.filter((i) => i.done).reduce((n, i) => n + (i.weight ?? 1), 0);
  return Math.round((done / total) * 100);
}

/**
 * Scored checklist with a progress ring: account security, profile
 * completeness, onboarding, KYC readiness. Open items first, each with its
 * fix-it action.
 */
export function ChecklistScore({
  items,
  levels,
  scoreLabel,
  className,
}: Readonly<{
  items: ChecklistItem[];
  /** Ordered by `min` descending or not: the highest matching level wins. */
  levels: ChecklistLevel[];
  /** Accessible label of the ring, e.g. "Security score". */
  scoreLabel: string;
  className?: string;
}>) {
  const score = checklistScore(items);
  const level = [...levels].sort((a, b) => b.min - a.min).find((l) => score >= l.min) ?? levels[0]!;
  const tone = TONE[level.tone];
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-4">
        <div className="relative size-16 shrink-0">
          <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={radius} className="fill-none stroke-muted" strokeWidth="7" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              className={cn('fill-none transition-[stroke-dashoffset] duration-700', tone.stroke)}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - score / 100)}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular"
            role="img"
            aria-label={`${scoreLabel}: ${score}%`}
          >
            {score}%
          </span>
        </div>
        <div className="min-w-0">
          <p className={cn('font-semibold', tone.text)}>{level.label}</p>
          <p className="text-xs text-muted-foreground">
            {items.filter((i) => i.done).length} / {items.length}
          </p>
        </div>
      </div>

      <ul className="space-y-1">
        {sorted.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 rounded-control px-1 py-1.5">
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full [&_svg]:size-3',
                item.done ? 'bg-success-soft text-success' : cn(tone.soft, tone.text),
              )}
              aria-hidden
            >
              {item.done ? <Check /> : <X />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm', item.done ? 'text-muted-foreground' : 'font-medium')}>
                {item.label}
                <span className="sr-only">{item.done ? ' ✓' : ''}</span>
              </p>
              {item.description ? (
                <p className="text-xs text-muted-foreground">{item.description}</p>
              ) : null}
            </div>
            {!item.done && item.action ? <ItemAction action={item.action} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const actionClass =
  'flex shrink-0 items-center gap-0.5 rounded-item text-xs font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring';

/** The fix-it link (or button) of an open item. */
function ItemAction({ action }: Readonly<{ action: NonNullable<ChecklistItem['action']> }>) {
  if (action.href) {
    return (
      <Link href={action.href} className={actionClass}>
        {action.label}
        <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={actionClass}>
      {action.label}
      <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
    </button>
  );
}
