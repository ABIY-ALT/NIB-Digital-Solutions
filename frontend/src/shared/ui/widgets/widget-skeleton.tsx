import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Card } from '../card';
import { Skeleton } from '../feedback';

/**
 * Loading placeholders shaped like the dashboard widgets, so content replaces
 * them without the page jumping. Each kind mirrors a real widget:
 *
 *   kpi      KpiCard               chart    TrendChart / BarChart / WaterfallChart
 *   hero     HeroCard              donut    DonutChart with legend
 *   stats    StatGrid in a card    list     EntityList / RankedList / Timeline
 *   table    CompactTable          funnel   FunnelChart
 *   gauge    SemiGauge + figures   ring     RadialProgress + figures
 *   radar    RadarChart            meters   MeterList / ProgressBar list
 *   stacked  StackedBar (+ list)   tracker  StatusTracker
 *   heatmap  Heatmap               tile     small Card
 *
 * Purely decorative (aria-hidden): announce loading once on the container.
 */
export type WidgetSkeletonSpec =
  | { kind: 'kpi' }
  | { kind: 'hero' }
  | { kind: 'stats'; items?: number }
  | { kind: 'chart'; variant?: 'area' | 'bars'; height?: number }
  | { kind: 'donut' }
  | { kind: 'list'; rows?: number; leading?: 'avatar' | 'icon' | 'rank' | 'dot' | 'none' }
  | { kind: 'table'; rows?: number; columns?: number }
  | { kind: 'funnel'; stages?: number }
  | { kind: 'gauge' }
  | { kind: 'ring' }
  | { kind: 'radar' }
  | { kind: 'meters'; rows?: number }
  | { kind: 'stacked'; rows?: number }
  | { kind: 'tracker'; steps?: number }
  | { kind: 'heatmap' }
  | { kind: 'tile' };

/** Fixed pseudo-random widths and heights: varied, but identical on server and client. */
const WIDTHS = ['72%', '55%', '83%', '64%', '47%', '78%', '59%', '68%'];
const BARS = [42, 58, 51, 67, 74, 62, 81, 70, 88, 76, 92, 84];
const at = <T,>(list: readonly T[], i: number): T => list[i % list.length]!;

const line = (width: string | number, className?: string) => (
  <Skeleton className={cn('h-3', className)} style={{ width }} />
);

/** Card chrome with a title/description header, like WidgetCard. */
function SkeletonCard({
  children,
  className,
  flush,
}: Readonly<{
  children: ReactNode;
  className?: string;
  flush?: boolean;
}>) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex-1 space-y-2">
          {line('38%', 'h-4')}
          {line('58%', 'h-2.5')}
        </div>
        <Skeleton className="h-6 w-16 rounded-pill" />
      </div>
      <div className={cn('flex-1', flush ? 'p-0' : 'p-5')}>{children}</div>
    </Card>
  );
}

export function KpiCardSkeleton({ className }: Readonly<{ className?: string }>) {
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2.5">
          {line('45%', 'h-2.5')}
          {line('60%', 'h-6')}
        </div>
        <Skeleton className="size-10 shrink-0" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-5 w-14 rounded-pill" />
          {line(72, 'h-2.5')}
        </div>
        <Skeleton className="h-[30px] w-[88px]" />
      </div>
    </Card>
  );
}

export function HeroCardSkeleton({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      className={cn(
        'relative flex min-h-[188px] animate-pulse flex-col justify-between overflow-hidden rounded-surface bg-muted p-5',
        className,
      )}
      aria-hidden
    >
      <div className="absolute -end-10 -top-14 size-48 rounded-full bg-surface/40" />
      <div className="relative max-w-[70%] space-y-2.5">
        <div className="h-2.5 w-24 rounded-control bg-surface/70" />
        <div className="h-5 w-48 rounded-control bg-surface/70" />
        <div className="h-2.5 w-40 rounded-control bg-surface/60" />
      </div>
      <div className="relative space-y-2">
        <div className="h-7 w-32 rounded-control bg-surface/70" />
        <div className="h-2.5 w-28 rounded-control bg-surface/60" />
      </div>
    </div>
  );
}

function ChartBody({
  variant = 'area',
  height = 280,
}: Readonly<{
  variant?: 'area' | 'bars';
  height?: number;
}>) {
  return (
    <div>
      <div className="mb-3 flex gap-4">
        {line(64, 'h-2.5')}
        {line(56, 'h-2.5')}
      </div>
      <div className="relative" style={{ height: height - 28 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute inset-x-0 border-t border-dashed border-border"
            style={{ top: `${i * 30}%` }}
          />
        ))}
        {variant === 'bars' ? (
          <div className="absolute inset-0 flex items-end gap-[3%] ps-10">
            {BARS.map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : (
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full animate-pulse ps-10"
          >
            <path
              d="M0,30 C10,24 18,27 26,20 C34,13 42,22 50,16 C58,10 66,15 74,9 C82,4 90,10 100,6 L100,40 L0,40 Z"
              className="fill-muted"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

function ListBody({
  rows = 5,
  leading = 'avatar',
}: Readonly<{
  rows?: number;
  leading?: 'avatar' | 'icon' | 'rank' | 'dot' | 'none';
}>) {
  return (
    <ul className="space-y-3.5">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3">
          {leading === 'avatar' ? <Skeleton className="size-9 shrink-0 rounded-full" /> : null}
          {leading === 'icon' ? <Skeleton className="size-9 shrink-0" /> : null}
          {leading === 'rank' ? <Skeleton className="size-6 shrink-0 rounded-full" /> : null}
          {leading === 'dot' ? <Skeleton className="size-8 shrink-0 rounded-full" /> : null}
          <div className="flex-1 space-y-2">
            {line(at(WIDTHS, i))}
            {line(at(WIDTHS, i + 3), 'h-2.5 opacity-70')}
          </div>
          <div className="flex flex-col items-end gap-2">
            {line(52)}
            {line(36, 'h-2.5 opacity-70')}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TableBody({ rows = 6, columns = 5 }: Readonly<{ rows?: number; columns?: number }>) {
  const grid: CSSProperties = { gridTemplateColumns: `2fr repeat(${columns - 1}, minmax(0, 1fr))` };
  return (
    <div>
      <div className="grid gap-4 border-b border-border bg-surface-muted px-5 py-3" style={grid}>
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} className="h-2.5" style={{ width: c === 0 ? '40%' : '60%' }} />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="grid items-center gap-4 px-5 py-3" style={grid}>
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              {line(at(WIDTHS, r))}
            </div>
            {Array.from({ length: columns - 1 }, (_, c) =>
              c === 1 ? (
                <Skeleton key={c} className="h-5 w-16 rounded-pill" />
              ) : (
                <div key={c}>{line(at(WIDTHS, r + c + 2))}</div>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelBody({ stages = 5 }: Readonly<{ stages?: number }>) {
  return (
    <div className="space-y-3">
      {Array.from({ length: stages }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          {line(80, 'shrink-0')}
          <div className="flex flex-1 justify-center">
            <Skeleton className="h-7" style={{ width: `${100 - i * 15}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutBody() {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="size-[168px] animate-pulse rounded-full border-[22px] border-muted" />
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-2.5 shrink-0" />
            {line(at(WIDTHS, i))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Figures({ count = 2 }: Readonly<{ count?: number }>) {
  return (
    <div
      className="grid w-full gap-3"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-item" />
      ))}
    </div>
  );
}

function MetersBody({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <ul className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="space-y-2">
          <div className="flex justify-between">
            {line(at(WIDTHS, i), 'max-w-[55%]')}
            {line(48)}
          </div>
          <Skeleton className="h-1.5 rounded-pill" />
        </li>
      ))}
    </ul>
  );
}

function StackedBody({ rows = 0 }: Readonly<{ rows?: number }>) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 rounded-pill" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-2.5 shrink-0" />
            {line(at(WIDTHS, i + 1))}
          </div>
        ))}
      </div>
      {rows ? <ListBody rows={rows} leading="none" /> : null}
    </div>
  );
}

function TrackerBody({ steps = 5 }: Readonly<{ steps?: number }>) {
  return (
    <div className="space-y-5 pt-2">
      <div className="relative flex justify-between">
        <div className="absolute inset-x-[10%] top-[17px] h-0.5 bg-muted" />
        {Array.from({ length: steps }, (_, i) => (
          <div key={i} className="relative flex flex-1 flex-col items-center gap-2">
            <Skeleton className="size-9 rounded-full" />
            {line('60%')}
            {line('45%', 'h-2.5 opacity-70')}
          </div>
        ))}
      </div>
      <Skeleton className="h-11 rounded-item" />
    </div>
  );
}

function HeatmapBody() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 7 }, (_, r) => (
        <div key={r} className="flex items-center gap-1">
          {line(28, 'shrink-0 h-2.5')}
          <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-1">
            {Array.from({ length: 24 }, (_, c) => (
              <div
                key={c}
                className="aspect-square animate-pulse rounded-[min(var(--radius-item),4px)] bg-muted"
                style={{ opacity: c >= 8 && c <= 18 && r < 5 ? 1 : 0.45 }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RadarBody() {
  return (
    <svg viewBox="0 0 200 200" className="mx-auto block w-full max-w-[260px] animate-pulse">
      {[1, 0.66, 0.33].map((f) => (
        <polygon
          key={f}
          points={Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 2;
            return `${100 + Math.cos(a) * 80 * f},${100 + Math.sin(a) * 80 * f}`;
          }).join(' ')}
          className="fill-none stroke-muted"
          strokeWidth={2}
        />
      ))}
      <polygon points="100,38 158,78 146,140 100,150 52,128 46,70" className="fill-muted" />
    </svg>
  );
}

/** One widget placeholder of the given kind. */
export function WidgetSkeleton({
  spec,
  className,
}: Readonly<{
  spec: WidgetSkeletonSpec;
  className?: string;
}>) {
  switch (spec.kind) {
    case 'kpi':
      return <KpiCardSkeleton className={className} />;
    case 'hero':
      return <HeroCardSkeleton className={className} />;
    case 'tile':
      return (
        <Card className={cn('space-y-3 p-4', className)}>
          {line('45%', 'h-2.5')}
          {line('85%', 'h-4')}
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-full" />
            {line('40%', 'h-2.5')}
          </div>
          <Figures />
        </Card>
      );
    case 'stats':
      return (
        <SkeletonCard className={className}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
            {Array.from({ length: spec.items ?? 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-[42px] shrink-0" />
                <div className="flex-1 space-y-2">
                  {line('70%', 'h-2.5')}
                  {line('55%', 'h-5')}
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      );
    case 'table':
      return (
        <SkeletonCard className={className} flush>
          <TableBody rows={spec.rows} columns={spec.columns} />
        </SkeletonCard>
      );
    case 'gauge':
      return (
        <SkeletonCard className={className}>
          <div className="flex flex-col items-center gap-4 pt-1">
            <div className="h-[100px] w-[200px] animate-pulse rounded-t-full border-[20px] border-b-0 border-muted" />
            <Figures />
          </div>
        </SkeletonCard>
      );
    case 'ring':
      return (
        <SkeletonCard className={className}>
          <div className="flex flex-col items-center gap-4">
            <div className="size-[132px] animate-pulse rounded-full border-[11px] border-muted" />
            <Figures />
            <Skeleton className="h-3.5 w-full rounded-pill" />
          </div>
        </SkeletonCard>
      );
    default:
      return (
        <SkeletonCard className={className}>
          <CardBody spec={spec} />
        </SkeletonCard>
      );
  }
}

/** The body of a card placeholder, by widget kind. */
function CardBody({ spec }: Readonly<{ spec: WidgetSkeletonSpec }>) {
  switch (spec.kind) {
    case 'chart':
      return <ChartBody variant={spec.variant} height={spec.height} />;
    case 'donut':
      return <DonutBody />;
    case 'list':
      return <ListBody rows={spec.rows} leading={spec.leading} />;
    case 'funnel':
      return <FunnelBody stages={spec.stages} />;
    case 'radar':
      return <RadarBody />;
    case 'meters':
      return <MetersBody rows={spec.rows} />;
    case 'stacked':
      return <StackedBody rows={spec.rows} />;
    case 'tracker':
      return <TrackerBody steps={spec.steps} />;
    case 'heatmap':
      return <HeatmapBody />;
    default:
      return null;
  }
}
