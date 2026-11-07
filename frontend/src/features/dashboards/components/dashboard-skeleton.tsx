'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { Skeleton } from '@/shared/ui/feedback';
import { WidgetSkeleton, type WidgetSkeletonSpec } from '@/shared/ui/widgets';
import type { DashboardId } from '../types';
import { GRID } from './views/parts';

/**
 * Loading placeholders per dashboard. Each blueprint mirrors its view row by
 * row — same grid, same card sizes, same content shapes — so the real
 * dashboard replaces it without the page jumping. Keep a blueprint in step
 * when you change its view; a dashboard without one falls back to GENERIC.
 */
type Cell = WidgetSkeletonSpec & { wide?: boolean };

export interface SkeletonRow {
  layout: 'kpis' | 'three' | 'two' | 'one' | 'tiles';
  /** A section heading above the row (e.g. "Upcoming webinars"). */
  heading?: boolean;
  cells: Cell[];
}

const LAYOUT: Record<SkeletonRow['layout'], string> = {
  kpis: GRID.kpis,
  three: GRID.three,
  two: GRID.two,
  one: 'grid grid-cols-1',
  tiles: GRID.kpis,
};

const KPIS: SkeletonRow = {
  layout: 'kpis',
  cells: Array.from({ length: 4 }, () => ({ kind: 'kpi' })),
};

const GENERIC: readonly SkeletonRow[] = [
  KPIS,
  { layout: 'three', cells: [{ kind: 'chart', wide: true }, { kind: 'donut' }] },
  { layout: 'three', cells: [{ kind: 'table', wide: true }, { kind: 'list' }] },
];

export const DASHBOARD_SKELETONS: Record<DashboardId, readonly SkeletonRow[]> = {
  crm: [
    { layout: 'three', cells: [{ kind: 'hero' }, { kind: 'stats', wide: true }] },
    KPIS,
    { layout: 'three', cells: [{ kind: 'chart', height: 300, wide: true }, { kind: 'donut' }] },
    { layout: 'three', cells: [{ kind: 'funnel' }, { kind: 'radar' }, { kind: 'list', rows: 5 }] },
    {
      layout: 'three',
      cells: [
        { kind: 'table', rows: 7, columns: 6, wide: true },
        { kind: 'list', rows: 5, leading: 'dot' },
      ],
    },
  ],
  analytics: [
    KPIS,
    { layout: 'three', cells: [{ kind: 'chart', height: 300, wide: true }, { kind: 'donut' }] },
    { layout: 'three', cells: [{ kind: 'heatmap', wide: true }, { kind: 'ring' }] },
    {
      layout: 'three',
      cells: [
        { kind: 'table', rows: 7, columns: 4, wide: true },
        { kind: 'list', rows: 6, leading: 'icon' },
      ],
    },
    { layout: 'two', cells: [{ kind: 'funnel' }, { kind: 'list', rows: 6, leading: 'rank' }] },
  ],
  ecommerce: [
    { layout: 'three', cells: [{ kind: 'hero' }, { kind: 'stats', wide: true }] },
    KPIS,
    {
      layout: 'three',
      cells: [{ kind: 'chart', variant: 'bars', height: 280, wide: true }, { kind: 'donut' }],
    },
    {
      layout: 'three',
      cells: [{ kind: 'list', rows: 5, leading: 'icon' }, { kind: 'funnel' }, { kind: 'meters' }],
    },
    {
      layout: 'three',
      cells: [{ kind: 'table', rows: 7, columns: 6, wide: true }, { kind: 'stacked' }],
    },
  ],
  academy: [
    {
      layout: 'three',
      cells: [{ kind: 'hero' }, { kind: 'chart', variant: 'bars', height: 150 }, { kind: 'donut' }],
    },
    KPIS,
    { layout: 'three', cells: [{ kind: 'chart', height: 280, wide: true }, { kind: 'list' }] },
    {
      layout: 'three',
      cells: [
        { kind: 'table', rows: 7, columns: 4, wide: true },
        { kind: 'list', rows: 4, leading: 'dot' },
      ],
    },
    { layout: 'tiles', heading: true, cells: Array.from({ length: 4 }, () => ({ kind: 'tile' })) },
  ],
  logistics: [
    KPIS,
    { layout: 'three', cells: [{ kind: 'stacked', rows: 4, wide: true }, { kind: 'gauge' }] },
    {
      layout: 'three',
      cells: [
        { kind: 'chart', variant: 'bars', height: 280, wide: true },
        { kind: 'list', rows: 6, leading: 'icon' },
      ],
    },
    { layout: 'three', cells: [{ kind: 'tracker', wide: true }, { kind: 'donut' }] },
    { layout: 'one', cells: [{ kind: 'table', rows: 6, columns: 6 }] },
  ],
  finance: [
    KPIS,
    { layout: 'three', cells: [{ kind: 'chart', height: 300, wide: true }, { kind: 'gauge' }] },
    {
      layout: 'three',
      cells: [{ kind: 'chart', variant: 'bars', height: 260, wide: true }, { kind: 'donut' }],
    },
    { layout: 'two', cells: [{ kind: 'meters' }, { kind: 'stacked' }] },
    { layout: 'one', cells: [{ kind: 'table', rows: 7, columns: 5 }] },
  ],
  support: [
    KPIS,
    { layout: 'three', cells: [{ kind: 'chart', height: 290, wide: true }, { kind: 'ring' }] },
    { layout: 'three', cells: [{ kind: 'donut' }, { kind: 'meters' }, { kind: 'stacked' }] },
    {
      layout: 'three',
      cells: [
        { kind: 'table', rows: 7, columns: 5, wide: true },
        { kind: 'list', rows: 5 },
      ],
    },
    { layout: 'one', cells: [{ kind: 'heatmap' }] },
  ],
  hr: [
    KPIS,
    {
      layout: 'three',
      cells: [{ kind: 'chart', variant: 'bars', height: 280, wide: true }, { kind: 'donut' }],
    },
    {
      layout: 'three',
      cells: [{ kind: 'list', rows: 6, leading: 'rank' }, { kind: 'funnel' }, { kind: 'radar' }],
    },
    {
      layout: 'three',
      cells: [
        { kind: 'table', rows: 6, columns: 4, wide: true },
        { kind: 'list', rows: 6, leading: 'dot' },
      ],
    },
    { layout: 'one', cells: [{ kind: 'chart', variant: 'bars', height: 220 }] },
  ],
};

/** A skeleton layout is static (it never reorders), so a position is a stable key. */
function byPosition<T>(items: readonly T[], prefix: string): Array<{ key: string; item: T }> {
  return items.map((item, index) => ({ key: `${prefix}${index}`, item }));
}

/** The body of a dashboard while its data or code loads (announced once to screen readers). */
export function DashboardSkeleton({ id }: Readonly<{ id?: DashboardId }>) {
  const t = useTranslations('dashboards.common');
  const rows = (id && DASHBOARD_SKELETONS[id]) || GENERIC;
  return (
    <div className="space-y-5">
      {/* First child: out of flow, so the rows keep their spacing. */}
      <output className="sr-only">{t('loading')}</output>
      {byPosition(rows, 'row').map(({ key, item: row }) => (
        <div key={key} className={cn(row.heading && 'space-y-3')}>
          {row.heading ? <Skeleton className="h-3.5 w-40" /> : null}
          <div className={LAYOUT[row.layout]} aria-hidden>
            {byPosition(row.cells, 'cell').map(({ key: cellKey, item: cell }) => (
              <WidgetSkeleton
                key={cellKey}
                spec={cell}
                className={cell.wide ? GRID.wide : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The dashboard header (icon, title, period switcher, actions) while the page loads. */
export function DashboardHeaderSkeleton() {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-72 max-w-[60vw]" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-[168px]" />
        <Skeleton className="size-7" />
        <Skeleton className="h-7 w-36" />
      </div>
    </div>
  );
}

/** Header + body: the route-level loading state of /dashboards/{id}. */
export function DashboardPageSkeleton({ id }: Readonly<{ id?: DashboardId }>) {
  return (
    <div>
      <DashboardHeaderSkeleton />
      <DashboardSkeleton id={id} />
    </div>
  );
}
