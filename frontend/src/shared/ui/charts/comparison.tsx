'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { colorAt, type ValueFormatter } from './chart-utils';

/**
 * HTML/CSS comparison charts (crisp at any width, no measuring):
 * FunnelChart, BulletChart and StackedBar.
 */

// ── FunnelChart ─────────────────────────────────────────────────────────────
export interface FunnelStage {
  label: string;
  value: number;
}

/** Stage-to-stage and overall conversion rates (0–1). */
export function funnelConversions(stages: readonly FunnelStage[]): {
  step: number[];
  overall: number;
} {
  const step = stages.slice(1).map((s, i) => (stages[i]!.value ? s.value / stages[i]!.value : 0));
  const first = stages[0]?.value ?? 0;
  return { step, overall: first ? (stages.at(-1)?.value ?? 0) / first : 0 };
}

/** Centred funnel: bar width ∝ volume, with the conversion rate between stages. */
export function FunnelChart({
  stages,
  formatValue = String,
  labels = { conversion: 'conversion', overall: 'Overall conversion' },
  className,
}: Readonly<{
  stages: FunnelStage[];
  formatValue?: ValueFormatter;
  labels?: { conversion: string; overall: string };
  className?: string;
}>) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  const { step, overall } = funnelConversions(stages);
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  return (
    <figure className={cn('space-y-1', className)}>
      <ol>
        {stages.map((s, i) => (
          <li key={s.label}>
            {i > 0 ? (
              <p className="flex items-center justify-center gap-1 py-0.5 text-[10px] text-subtle-foreground">
                <ChevronDown className="size-3" aria-hidden /> {pct(step[i - 1]!)}{' '}
                {labels.conversion}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <span
                className="w-28 shrink-0 truncate text-end text-xs text-muted-foreground"
                title={s.label}
              >
                {s.label}
              </span>
              <div className="flex flex-1 justify-center">
                <div
                  className="flex h-8 items-center justify-center rounded-item text-xs font-semibold text-white shadow-card transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.max(8, (s.value / max) * 100)}%`,
                    background: `color-mix(in srgb, var(--chart-1) ${100 - (i / Math.max(1, stages.length - 1)) * 70}%, var(--chart-2))`,
                  }}
                >
                  <span className="truncate px-2 tabular drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]">
                    {formatValue(s.value)}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="pt-2 text-center text-xs text-muted-foreground">
        {labels.overall}:{' '}
        <span className="font-semibold text-foreground tabular">{pct(overall)}</span>
      </figcaption>
    </figure>
  );
}

// ── BulletChart ─────────────────────────────────────────────────────────────
export interface BulletItem {
  id: string;
  label: ReactNode;
  actual: number;
  target: number;
  /** Scale maximum (default: 1.2 × max(actual, target)). */
  max?: number;
}

/** On target or better: success; from 80 % of the target: warning; below: danger. */
function attainmentTone(ratio: number): string {
  if (ratio >= 1) return 'text-success';
  return ratio >= 0.8 ? 'text-warning' : 'text-danger';
}

/**
 * Actual-vs-target bars (Stephen Few's bullet graph): qualitative bands,
 * the actual bar and a target tick. Green when the target is met.
 */
export function BulletChart({
  items,
  formatValue = String,
  labels = { target: 'Target', ofTarget: 'of target' },
  className,
}: Readonly<{
  items: BulletItem[];
  formatValue?: ValueFormatter;
  labels?: { target: string; ofTarget: string };
  className?: string;
}>) {
  return (
    <ul className={cn('space-y-3.5', className)}>
      {items.map((it) => {
        const max = it.max ?? Math.max(it.actual, it.target) * 1.2;
        const ratio = it.target ? it.actual / it.target : 0;
        const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
        return (
          <li key={it.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium">{it.label}</span>
              <span className="shrink-0 text-muted-foreground tabular">
                {formatValue(it.actual)} ·{' '}
                <span className={cn('font-semibold', attainmentTone(ratio))}>
                  {(ratio * 100).toFixed(0)}%
                </span>{' '}
                {labels.ofTarget}
              </span>
            </div>
            <div
              className="relative h-4 overflow-hidden rounded-item bg-muted"
              title={`${labels.target}: ${formatValue(it.target)}`}
            >
              {/* qualitative bands: < 80 % of target, 80–100 %, above */}
              <div
                className="absolute inset-y-0 start-0 bg-border/60"
                style={{ width: w(it.target * 0.8) }}
              />
              <div
                className="absolute inset-y-0 start-0 bg-border/30"
                style={{ width: w(it.target) }}
              />
              <div
                className={cn(
                  'absolute inset-y-1 start-0 rounded-e-item transition-[width] duration-700 ease-out',
                  ratio >= 1 ? 'bg-success' : 'bg-secondary',
                )}
                style={{ width: w(it.actual) }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground"
                style={{ insetInlineStart: w(it.target) }}
                aria-hidden
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── StackedBar ──────────────────────────────────────────────────────────────
export interface StackedSegment {
  label: string;
  value: number;
  color?: string;
}

/** One 100 % bar showing composition, with an interactive legend. */
export function StackedBar({
  segments,
  formatValue = String,
  height = 14,
  className,
}: Readonly<{
  segments: StackedSegment[];
  formatValue?: ValueFormatter;
  height?: number;
  className?: string;
}>) {
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <figure className={cn('space-y-3', className)} onPointerLeave={() => setActive(null)}>
      <div
        className="flex w-full gap-0.5 overflow-hidden rounded-pill"
        style={{ height }}
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${((s.value / total) * 100).toFixed(1)}%`)
          .join(', ')}
      >
        {segments.map((s, i) => (
          <div
            key={s.label}
            onPointerEnter={() => setActive(i)}
            className="h-full transition-[opacity,flex-grow] duration-300"
            style={{
              flexGrow: s.value,
              flexBasis: 0,
              background: colorAt(i, s.color),
              opacity: active === null || active === i ? 1 : 0.35,
            }}
            title={`${s.label}: ${formatValue(s.value)}`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {segments.map((s, i) => (
          <li
            key={s.label}
            onPointerEnter={() => setActive(i)}
            className={cn(
              'flex items-center gap-2 rounded-item px-1 py-0.5',
              active === i && 'bg-hover',
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-[min(var(--radius-item),4px)]"
              style={{ background: colorAt(i, s.color) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular">{((s.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
