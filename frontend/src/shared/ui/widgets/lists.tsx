'use client';

import { AlertCircle, Check, Circle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * List-style widgets: SegmentedControl, Timeline, RankedList, StatusTracker,
 * MeterList. Data-driven and presentational — pass already-translated text.
 */

// ── SegmentedControl ────────────────────────────────────────────────────────
export function SegmentedControl<V extends string>({
  value,
  onChange,
  options,
  label,
  size = 'sm',
  className,
}: Readonly<{
  value: V;
  onChange: (value: V) => void;
  options: Array<{ value: V; label: string }>;
  /** Accessible name of the group. */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex rounded-control border border-border bg-surface-muted p-0.5',
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[calc(var(--radius-control)-2px)] font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs',
              selected
                ? 'bg-surface text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────
const TIMELINE_TONES = {
  primary: 'bg-primary-soft text-primary-text ring-primary/30',
  success: 'bg-success-soft text-success ring-success/30',
  warning: 'bg-warning-soft text-warning ring-warning/30',
  danger: 'bg-danger-soft text-danger ring-danger/30',
  info: 'bg-info-soft text-info ring-info/30',
  neutral: 'bg-muted text-muted-foreground ring-border',
} as const;

export interface TimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  time: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof TIMELINE_TONES;
  meta?: ReactNode;
}

/** Vertical activity timeline with tinted icon nodes and a connecting rail. */
export function Timeline({
  items,
  className,
}: Readonly<{ items: TimelineItem[]; className?: string }>) {
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 ? (
            <span className="absolute start-[15px] top-8 bottom-0 w-px bg-border" aria-hidden />
          ) : null}
          <span
            className={cn(
              'relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface [&_svg]:size-4',
              TIMELINE_TONES[item.tone ?? 'neutral'],
            )}
          >
            {item.icon}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <span className="shrink-0 text-[11px] text-subtle-foreground">{item.time}</span>
            </div>
            {item.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
            ) : null}
            {item.meta ? <div className="mt-1.5">{item.meta}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── RankedList ──────────────────────────────────────────────────────────────
export interface RankedItem {
  id: string;
  label: ReactNode;
  sublabel?: ReactNode;
  value: ReactNode;
  /** 0–1 relative to the leader (bar length). */
  share: number;
  /** Optional change indicator next to the value. */
  trend?: ReactNode;
}

/** Leaderboard: rank badge (gold/silver/bronze), label, value and a relative bar. */
export function RankedList({
  items,
  className,
}: Readonly<{ items: RankedItem[]; className?: string }>) {
  const medal = [
    'bg-primary text-primary-foreground',
    'bg-[#c0c4c9] text-foreground',
    'bg-[#c7874a] text-white',
  ];
  return (
    <ol className={cn('space-y-3', className)}>
      {items.map((item, i) => (
        <li key={item.id} className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular',
              medal[i] ?? 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium">
                {item.label}
                {item.sublabel ? (
                  <span className="ms-1.5 text-xs font-normal text-subtle-foreground">
                    {item.sublabel}
                  </span>
                ) : null}
              </p>
              <p className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular">
                {item.value}
                {item.trend}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-muted">
              <div
                className="h-full rounded-pill bg-gradient-to-r from-secondary to-primary transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(2, Math.min(100, item.share * 100))}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── StatusTracker ───────────────────────────────────────────────────────────
export interface TrackerStep {
  id: string;
  label: string;
  description?: ReactNode;
  count?: ReactNode;
  state: 'done' | 'current' | 'upcoming' | 'error';
}

const STEP_MARKER: Record<TrackerStep['state'], string> = {
  done: 'border-secondary bg-secondary text-secondary-foreground',
  current:
    'border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_rgb(254_185_20/0.2)]',
  upcoming: 'border-border bg-surface text-muted-foreground',
  error: 'border-danger bg-danger-soft text-danger',
};

/** A step's circle: a check when done, an alert on error, a dot while current, else its number. */
function StepMarker({ state, number }: Readonly<{ state: TrackerStep['state']; number: number }>) {
  let content: ReactNode = number;
  if (state === 'done') content = <Check className="size-4" strokeWidth={3} />;
  else if (state === 'error') content = <AlertCircle className="size-4" />;
  else if (state === 'current') content = <Circle className="size-2.5 fill-current" />;
  return (
    <span
      className={cn(
        'relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
        STEP_MARKER[state],
      )}
    >
      {content}
    </span>
  );
}

/** Horizontal process tracker (e.g. maker → checker → approved → posted), stacks on phones. */
export function StatusTracker({
  steps,
  className,
}: Readonly<{ steps: TrackerStep[]; className?: string }>) {
  return (
    <ol className={cn('flex flex-col gap-4 sm:flex-row sm:gap-0', className)}>
      {steps.map((step, i) => (
        <li
          key={step.id}
          className="relative flex flex-1 gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          {i < steps.length - 1 ? (
            <span
              className={cn(
                'absolute hidden h-0.5 sm:block sm:start-[calc(50%+22px)] sm:end-[calc(-50%+22px)] sm:top-[17px]',
                step.state === 'done' ? 'bg-secondary' : 'bg-border',
              )}
              aria-hidden
            />
          ) : null}
          <StepMarker state={step.state} number={i + 1} />
          <div className="min-w-0">
            <p
              className={cn(
                'text-xs font-semibold',
                step.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {step.label}
            </p>
            {step.count !== undefined ? (
              <p className="text-lg leading-tight font-semibold tabular">{step.count}</p>
            ) : null}
            {step.description ? (
              <p className="text-[11px] text-subtle-foreground">{step.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── MeterList ───────────────────────────────────────────────────────────────
export interface MeterItem {
  id: string;
  label: ReactNode;
  used: number;
  limit: number;
  /** Rendered as "used / limit" (already formatted). */
  caption?: ReactNode;
}

/** Bar colour by utilisation: red from `danger`, amber from `warning`, green below. */
function meterTone(ratio: number, warning: number, danger: number): string {
  if (ratio >= danger) return 'bg-danger';
  return ratio >= warning ? 'bg-[var(--chart-5)]' : 'bg-success';
}

/** Utilisation bars with threshold colours (limits, quotas, capacity). */
export function MeterList({
  items,
  warning = 0.75,
  danger = 0.9,
  className,
}: Readonly<{
  items: MeterItem[];
  warning?: number;
  danger?: number;
  className?: string;
}>) {
  return (
    <ul className={cn('space-y-3.5', className)}>
      {items.map((m) => {
        const ratio = m.limit ? m.used / m.limit : 0;
        const tone = meterTone(ratio, warning, danger);
        return (
          <li key={m.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-foreground">{m.label}</span>
              <span className="shrink-0 text-muted-foreground tabular">
                {m.caption}{' '}
                <span
                  className={cn(
                    'ms-1 font-semibold',
                    ratio >= danger ? 'text-danger' : 'text-foreground',
                  )}
                >
                  {(ratio * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-pill bg-muted">
              {/* The bar is drawn; assistive technology reads this native meter. */}
              <meter className="sr-only" min={0} max={m.limit} value={m.used} />
              <div
                className={cn('h-full rounded-pill transition-[width] duration-700 ease-out', tone)}
                style={{ width: `${Math.min(100, ratio * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
