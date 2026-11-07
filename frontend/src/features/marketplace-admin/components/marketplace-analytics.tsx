'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  ChartLine,
  ExternalLink,
  Eye,
  Inbox,
  MessageSquare,
  Package,
  PlayCircle,
  Trophy,
  Workflow,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useLookup } from '@/features/reference-data/hooks/use-reference-data';
import type { MarketplaceAnalytics } from '@/features/marketplace/types';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { describeError } from '@/shared/errors/error-messages';
import { formatDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { BarChart, TrendChart } from '@/shared/ui/charts';
import { ErrorState, Skeleton } from '@/shared/ui/feedback';
import { PageHeader } from '@/shared/ui/page-header';
import { RefreshButton } from '@/shared/ui/row-actions';
import { StatStrip } from '@/shared/ui/stat-strip';
import { useLeadOwners } from './lead-list';

/** Reporting periods (days) the backend offers. */
const PERIODS = [7, 30, 90, 365] as const;
type Period = (typeof PERIODS)[number];

const STATUSES = [
  'new',
  'contacted',
  'scheduled',
  'completed',
  'qualified',
  'closed_won',
  'closed_lost',
] as const;
const pct = (part: number, whole: number) =>
  whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%';

export const analyticsKey = ['marketplace', 'analytics'] as const;

/** Ranked list with single-hue bars (values at the bar end). Also used on the staff home page. */
export function Ranked({
  rows,
  empty,
}: {
  rows: { label: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.value}`}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate font-medium">{r.label}</span>
            <span className="tabular shrink-0 text-muted-foreground">
              {r.value.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-secondary"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MarketplaceAnalyticsView({
  productNames,
}: {
  productNames: Record<string, string>;
}) {
  const t = useTranslations('marketplaceAdmin');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const tl = useTranslations('marketplaceAdmin.leads');
  const [days, setDays] = useState<Period>(30);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: [...analyticsKey, days],
    queryFn: async ({ signal }) =>
      (
        await apiFetch<MarketplaceAnalytics>('/api/marketplace/admin/analytics', {
          query: { days },
          signal,
        })
      ).data,
    // Keep the current figures on screen while another period loads.
    placeholderData: (previous) => previous,
  });
  const industries = useLookup('marketplace-industries', { includeInactive: true });
  const industryName = useMemo(() => {
    const names = new Map((industries.data ?? []).map((o) => [o.code.toLowerCase(), o.label]));
    return (id: string) => names.get(id) ?? id;
  }, [industries.data]);
  const ownerName = useLeadOwners(
    'demo',
    (data?.openByOwner ?? []).map((o) => o.ownerId),
  );
  const sourceLabel = (source: string) =>
    source === 'unknown' ? t('analytics.unknownSource') : tl(`sources.${source}`);
  const name = (slug: string) => productNames[slug] ?? slug;
  const top = (rows: MarketplaceAnalytics['topViewed']) =>
    rows.slice(0, 6).map((r) => ({ label: name(r.slug), value: r.count }));
  const daily = useMemo(() => data?.daily ?? [], [data]);

  const header = (
    <PageHeader
      icon={<ChartLine />}
      title={t('analytics.title')}
      description={t('analytics.description', { days })}
      actions={
        <>
          <label className="sr-only" htmlFor="analytics-period">
            {t('analytics.period')}
          </label>
          <select
            id="analytics-period"
            className="h-control rounded-control border border-border-strong bg-surface px-2.5 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as Period)}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`analytics.periods.${p}`)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" asChild>
            <a href="/" target="_blank" rel="noreferrer">
              <ExternalLink /> {t('analytics.viewSite')}
            </a>
          </Button>
          <RefreshButton
            busy={isFetching}
            onClick={() => refetch()}
            label={tc('refresh')}
            busyLabel={tc('refreshing')}
          />
        </>
      }
    />
  );

  if (error) {
    const e = describeError(error, te);
    return (
      <>
        {header}
        <ErrorState
          title={te('title')}
          description={e.message}
          correlationId={e.correlationId}
          referenceLabel={tc('reference')}
        />
      </>
    );
  }
  if (isPending || !data) {
    return (
      <>
        {header}
        <div className="grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
          <Skeleton className="h-60" />
        </div>
      </>
    );
  }

  const leads = data.demoRequests + data.inquiries;
  const won = data.leadsByStatus.closed_won;

  return (
    <>
      {header}
      <div className="space-y-4">
        <StatStrip
          items={[
            {
              id: 'products',
              label: t('analytics.stats.products'),
              value: data.totalProducts,
              icon: <Package />,
              tone: 'secondary',
              hint: t('analytics.stats.productsHint', { count: data.publishedProducts }),
            },
            {
              id: 'views',
              label: t('analytics.stats.views'),
              value: data.productViews.toLocaleString(),
              icon: <Eye />,
              tone: 'info',
            },
            {
              id: 'plays',
              label: t('analytics.stats.plays'),
              value: data.demoPlays.toLocaleString(),
              icon: <PlayCircle />,
              tone: 'primary',
              hint: t('analytics.stats.playsHint', {
                rate: pct(data.demoPlays, data.productViews),
              }),
            },
            {
              id: 'questions',
              label: t('analytics.stats.questions'),
              value: data.assistantQueries.toLocaleString(),
              icon: <MessageSquare />,
              tone: 'neutral',
            },
          ]}
        />
        <StatStrip
          items={[
            {
              id: 'demos',
              label: t('analytics.stats.demoRequests'),
              value: data.demoRequests,
              icon: <CalendarCheck />,
              tone: 'success',
            },
            {
              id: 'inquiries',
              label: t('analytics.stats.inquiries'),
              value: data.inquiries,
              icon: <Inbox />,
              tone: 'info',
            },
            {
              id: 'conversion',
              label: t('analytics.stats.conversion'),
              value: pct(leads, data.productViews),
              icon: <Workflow />,
              tone: 'secondary',
              hint: t('analytics.stats.conversionHint'),
            },
            {
              id: 'won',
              label: t('analytics.stats.won'),
              value: pct(won, leads),
              icon: <Trophy />,
              tone: 'success',
              hint: t('analytics.stats.wonHint', { won, leads }),
            },
          ]}
        />

        <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.viewsChart')}</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart
                title={t('analytics.viewsChart')}
                data={daily}
                label={(d) => formatDate(d.date, locale, { day: 'numeric', month: 'short' })}
                series={[{ key: 'views', label: t('analytics.views') }]}
                value={(d) => d.views}
                variant="area"
                height={240}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.leadsChart')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <BarChart
                title={t('analytics.leadsChart')}
                data={daily}
                label={(d) => formatDate(d.date, locale, { day: 'numeric', month: 'short' })}
                series={[{ key: 'leads', label: t('analytics.leads') }]}
                value={(d) => d.leads}
                height={160}
              />
              <div className="border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-semibold">{t('analytics.pipeline')}</h3>
                <Ranked
                  rows={STATUSES.map((s) => ({
                    label: t(`status.${s}`),
                    value: data.leadsByStatus[s],
                  }))}
                  empty={t('analytics.empty')}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.topViewed')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Ranked rows={top(data.topViewed)} empty={t('analytics.empty')} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.topWatched')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Ranked rows={top(data.topWatched)} empty={t('analytics.empty')} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.topRequested')}</CardTitle>
              <CardDescription>{t('analytics.topRequestedHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Ranked rows={top(data.topRequested)} empty={t('analytics.empty')} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.bySource')}</CardTitle>
              <CardDescription>{t('analytics.bySourceHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Ranked
                rows={data.leadsBySource.map((r) => ({
                  label: sourceLabel(r.source),
                  value: r.count,
                }))}
                empty={t('analytics.empty')}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.byIndustry')}</CardTitle>
              <CardDescription>{t('analytics.byIndustryHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Ranked
                rows={data.leadsByIndustry
                  .slice(0, 8)
                  .map((r) => ({ label: industryName(r.industry), value: r.count }))}
                empty={t('analytics.empty')}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.byOwner')}</CardTitle>
              <CardDescription>{t('analytics.byOwnerHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Ranked
                rows={data.openByOwner.map((r) => ({
                  label: ownerName(r.ownerId) ?? tl('unassigned'),
                  value: r.count,
                }))}
                empty={t('analytics.empty')}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
