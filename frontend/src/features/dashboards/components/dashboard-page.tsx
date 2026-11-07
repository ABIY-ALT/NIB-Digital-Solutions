'use client';

import { ChevronDown, LayoutGrid, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ComponentType, type ReactNode } from 'react';
import { describeError } from '@/shared/errors/error-messages';
import { cn } from '@/shared/lib/cn';
import { NavIcon } from '@/shared/layouts/navigation';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/shared/ui/menu';
import { RelativeTime } from '@/shared/ui/relative-time';
import { SegmentedControl } from '@/shared/ui/widgets';
import { useDashboardData } from '../hooks/use-dashboard-data';
import { useDashboardFormat } from '../hooks/use-dashboard-format';
import { findDashboard } from '../registry';
import type { DashboardDataMap, DashboardId, DashboardRange } from '../types';
import { DashboardSkeleton } from './dashboard-skeleton';
import { DASHBOARD_VIEWS } from './views';
import type { DashboardViewProps } from './views/parts';

/**
 * Shell shared by every catalogue dashboard: title, data-source label, period
 * switcher (kept in the URL as ?range=), refresh, last update and a switcher
 * to the other dashboards this user may open. The body is the dashboard's
 * code-split view; loading and error states are handled here, once.
 */
export function DashboardPage({
  id,
  initialRange,
  available,
}: Readonly<{
  id: DashboardId;
  initialRange: DashboardRange;
  /** Dashboards this user may open (resolved on the server). */
  available: readonly DashboardId[];
}>) {
  const t = useTranslations('dashboards');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const f = useDashboardFormat();
  const definition = findDashboard(id)!;
  const [range, setRange] = useState(initialRange);
  const { data, error, isFetching, isPlaceholderData, refetch } = useDashboardData(id, range, {
    refreshSeconds: definition.refreshSeconds,
  });

  const changeRange = (next: DashboardRange) => {
    setRange(next);
    // Shareable URL without a server round trip (Next.js keeps useSearchParams in sync).
    const url = new URL(window.location.href);
    url.searchParams.set('range', next);
    window.history.replaceState(window.history.state, '', url);
  };

  // The view's prop type is exact per id; the shell renders "the view of this id".
  const View = DASHBOARD_VIEWS[id] as ComponentType<
    DashboardViewProps<DashboardDataMap[DashboardId]>
  >;
  const failure = error && !data ? describeError(error, te) : null;

  let body: ReactNode;
  if (failure) {
    body = (
      <ErrorState
        className="rounded-surface border border-border bg-surface"
        title={t('common.loadError')}
        description={failure.message}
        correlationId={failure.correlationId}
        referenceLabel={tc('reference')}
        action={
          <Button variant="outline" onClick={() => refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    );
  } else if (data) {
    body = (
      <div
        className={cn('transition-opacity', isPlaceholderData && 'opacity-60')}
        aria-busy={isPlaceholderData || undefined}
      >
        <View data={data.data} range={data.range} />
      </div>
    );
  } else {
    body = <DashboardSkeleton id={id} />;
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-text">
            <NavIcon name={definition.icon} className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl leading-tight font-semibold">
              {t(`catalogue.${id}.title`)}
              {data?.source === 'sample' ? (
                <Tooltip content={t('common.sampleHint')}>
                  <Badge tone="info" className="py-0 text-[10px]">
                    {t('common.sample')}
                  </Badge>
                </Tooltip>
              ) : null}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(`catalogue.${id}.description`)}
              {data ? (
                <>
                  {' · '}
                  {t('common.updated')} <RelativeTime value={data.generatedAt} locale={f.locale} />
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {definition.ranges.length > 1 ? (
            <SegmentedControl<DashboardRange>
              label={t('common.range')}
              value={range}
              onChange={changeRange}
              options={definition.ranges.map((r) => ({ value: r, label: t(`common.ranges.${r}`) }))}
            />
          ) : null}
          <Tooltip content={t('common.refresh')}>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label={t('common.refresh')}
            >
              <RefreshCw className={cn(isFetching && 'animate-spin')} />
            </Button>
          </Tooltip>
          {available.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <LayoutGrid />
                  {t('common.switch')}
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>{t('common.switch')}</DropdownMenuLabel>
                {available.map((other) => (
                  <DropdownMenuItem
                    key={other}
                    asChild
                    className={cn(other === id && 'font-semibold')}
                  >
                    <Link
                      href={`/dashboards/${other}`}
                      aria-current={other === id ? 'page' : undefined}
                    >
                      <NavIcon name={findDashboard(other)?.icon} className="size-4" />
                      {t(`catalogue.${other}.title`)}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboards">
                    <LayoutGrid />
                    {t('common.all')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      {body}
    </div>
  );
}
