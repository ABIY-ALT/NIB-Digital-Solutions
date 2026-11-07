'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { KpiCard, relativeChange, type KpiCardProps } from '@/shared/ui/widgets';
import type { DashboardRange, Metric } from '../../types';

/** What every dashboard view receives from the shell. */
export interface DashboardViewProps<T> {
  data: T;
  range: DashboardRange;
}

/** A view's `t` as handed to its table column definitions. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export const metricDelta = (m: Metric): number => relativeChange(m.value, m.previous);

/** "vs previous 30 days" for the selected range. */
export function useVsPrevious(range: DashboardRange): string {
  return useTranslations('dashboards.common.vsPrevious')(range);
}

/** KpiCard bound to a Metric: value, delta vs the previous period and sparkline. */
export function MetricCard({
  metric,
  format,
  range,
  ...props
}: Omit<KpiCardProps, 'value' | 'delta' | 'deltaLabel' | 'trend'> & {
  metric: Metric;
  format: (v: number) => string;
  range: DashboardRange;
}) {
  const vs = useVsPrevious(range);
  return (
    <KpiCard
      {...props}
      value={format(metric.value)}
      delta={metricDelta(metric)}
      deltaLabel={vs}
      trend={metric.trend}
    />
  );
}

const FIGURE_COLOR = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
} as const;

/** Small label/value cell used in summary strips inside cards. */
export function Figure({
  label,
  value,
  tone,
}: Readonly<{
  label: ReactNode;
  value: ReactNode;
  tone?: 'success' | 'danger' | 'warning';
}>) {
  const color = tone ? FIGURE_COLOR[tone] : '';
  return (
    <div className="rounded-item bg-surface-muted p-2.5 text-center">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-semibold tabular ${color}`}>{value}</dd>
    </div>
  );
}

/** Standard dashboard grids, so every view lines up the same way. */
export const GRID = {
  kpis: 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
  three: 'grid grid-cols-1 gap-5 lg:grid-cols-3',
  two: 'grid grid-cols-1 gap-5 lg:grid-cols-2',
  wide: 'lg:col-span-2',
} as const;
