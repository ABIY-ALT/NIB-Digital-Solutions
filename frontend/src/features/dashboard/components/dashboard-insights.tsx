'use client';

import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  Ban,
  Landmark,
  LayoutGrid,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Wallet,
  Workflow,
  XCircle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/menu';
import {
  BarChart,
  DonutChart,
  Heatmap,
  RadialProgress,
  TrendChart,
  compactNumber,
} from '@/shared/ui/charts';
import { RelativeTime } from '@/shared/ui/relative-time';
import {
  KpiCard,
  MeterList,
  RankedList,
  SegmentedControl,
  StatusTracker,
  Timeline,
  type TimelineItem,
} from '@/shared/ui/widgets';
import { createDemoData, periodChange } from '../demo/mock-data';
import { Gauge, Panel } from './insights/panel';

type Range = '7' | '30' | '90';
type InsightTab = 'overview' | 'treasury' | 'operations' | 'customers';

// Each tab's panel is code-split and loads the first time the tab is opened.
const TreasuryPanel = dynamic(
  () => import('./insights/treasury-panel').then((m) => m.TreasuryPanel),
  { loading: () => <PanelSkeleton /> },
);
const OperationsPanel = dynamic(
  () => import('./insights/operations-panel').then((m) => m.OperationsPanel),
  { loading: () => <PanelSkeleton /> },
);
const CustomersPanel = dynamic(
  () => import('./insights/customers-panel').then((m) => m.CustomersPanel),
  { loading: () => <PanelSkeleton /> },
);

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-72 rounded-surface" />
      ))}
    </div>
  );
}

/**
 * "Operations insights" — the reusable chart and widget kit (shared/ui/charts,
 * shared/ui/widgets) demonstrated with deterministic mock data, organised in tabs.
 * Replace the demo generators with real hooks per widget; the components stay the same.
 * Shown when the `dashboardInsights` feature flag is on.
 */
export function DashboardInsights() {
  const t = useTranslations('dashboard.insights');
  const [tab, setTab] = useState<InsightTab>('overview');
  const [range, setRange] = useState<Range>('30');
  const tabs: Array<{ id: InsightTab; icon: ReactNode }> = [
    { id: 'overview', icon: <LayoutGrid /> },
    { id: 'treasury', icon: <Landmark /> },
    { id: 'operations', icon: <Workflow /> },
    { id: 'customers', icon: <Users /> },
  ];

  return (
    <section aria-labelledby="insights-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="insights-title" className="flex items-center gap-2 text-base font-semibold">
            {t('title')}
            <Badge tone="info" className="py-0 text-[10px]">
              {t('sample')}
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
        {tab === 'overview' ? (
          <SegmentedControl<Range>
            label={t('range')}
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: t('ranges.7') },
              { value: '30', label: t('ranges.30') },
              { value: '90', label: t('ranges.90') },
            ]}
          />
        ) : null}
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as InsightTab)}>
        <TabsList aria-label={t('title')} className="scrollbar-thin overflow-x-auto">
          {tabs.map((x) => (
            <TabsTrigger
              key={x.id}
              value={x.id}
              className="flex items-center gap-2 whitespace-nowrap [&_svg]:size-4"
            >
              {x.icon}
              {t(`tabs.${x.id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="pt-5">
          <OverviewPanel range={range} />
        </TabsContent>
        <TabsContent value="treasury" className="pt-5">
          <TreasuryPanel />
        </TabsContent>
        <TabsContent value="operations" className="pt-5">
          <OperationsPanel />
        </TabsContent>
        <TabsContent value="customers" className="pt-5">
          <CustomersPanel />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** Overview tab: KPIs, cash flow, channels, branches, health, limits, pipeline, peak hours, events. */
function OverviewPanel({ range }: Readonly<{ range: Range }>) {
  const t = useTranslations('dashboard.insights');
  const locale = useLocale();
  const demo = useMemo(() => createDemoData(), []);
  const days = Number(range);
  const period = demo.daily.slice(-days);

  const money = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'ETB',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v);
  const count = (v: number) => new Intl.NumberFormat(locale).format(v);
  const compact = (v: number) => compactNumber(v, locale);
  const dayLabel = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const monthLabel = (ym: string) =>
    new Date(`${ym}-01T00:00:00`).toLocaleDateString(locale, { month: 'short' });

  const sum = (key: 'inflow' | 'transactions' | 'failed') => period.reduce((a, d) => a + d[key], 0);
  const series = (key: 'inflow' | 'transactions' | 'failed') => demo.daily.map((d) => d[key]);
  const failureRate = sum('failed') / Math.max(1, sum('transactions'));
  const vs = t('vsPrevious', { days });

  // Weekday names from Intl (Monday first), so Amharic works without extra messages.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  );
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

  const eventIcon: Record<string, { icon: ReactNode; tone: TimelineItem['tone'] }> = {
    approved: { icon: <BadgeCheck />, tone: 'success' },
    blocked: { icon: <ShieldAlert />, tone: 'danger' },
    payroll: { icon: <Wallet />, tone: 'primary' },
    rejected: { icon: <XCircle />, tone: 'warning' },
    limit: { icon: <SlidersHorizontal />, tone: 'info' },
    login: { icon: <Ban />, tone: 'danger' },
  };
  // Stable "now" for the relative times (computed once; RelativeTime refreshes itself).
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t('kpi.value')}
          value={money(sum('inflow'))}
          icon={<Banknote />}
          tone="primary"
          delta={periodChange(series('inflow'), days)}
          deltaLabel={vs}
          trend={series('inflow').slice(-days)}
        />
        <KpiCard
          label={t('kpi.transactions')}
          value={count(sum('transactions'))}
          icon={<ArrowLeftRight />}
          tone="secondary"
          delta={periodChange(series('transactions'), days)}
          deltaLabel={vs}
          trend={series('transactions').slice(-days)}
        />
        <KpiCard
          label={t('kpi.customers')}
          value={count(Math.round(sum('transactions') * 0.31))}
          icon={<Users />}
          tone="info"
          delta={periodChange(series('transactions'), days) * 0.6}
          deltaLabel={vs}
          trend={series('transactions')
            .slice(-days)
            .map((v) => v * 0.31)}
        />
        <KpiCard
          label={t('kpi.failure')}
          value={`${(failureRate * 100).toFixed(2)}%`}
          icon={<AlertTriangle />}
          tone="danger"
          positiveIsGood={false}
          delta={periodChange(series('failed'), days) - periodChange(series('transactions'), days)}
          deltaLabel={vs}
          trend={series('failed').slice(-days)}
        />
      </div>

      {/* Trend + channel mix */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title={t('flow.title')}
          description={t('flow.description')}
        >
          <TrendChart
            title={t('flow.title')}
            data={period}
            label={(d) => dayLabel(d.date)}
            series={[
              { key: 'inflow', label: t('flow.inflow') },
              { key: 'outflow', label: t('flow.outflow') },
            ]}
            formatValue={money}
            formatAxis={compact}
            height={330}
          />
        </Panel>
        <Panel title={t('channels.title')} description={t('channels.description')}>
          <DonutChart
            title={t('channels.title')}
            data={demo.channels.map((c) => ({ label: t(`channels.${c.key}`), value: c.value }))}
            centerLabel={t('channels.total')}
            centerValue={compact(demo.channels.reduce((a, c) => a + c.value, 0))}
            formatValue={compact}
            legend="bottom"
            size={168}
          />
        </Panel>
      </div>

      {/* Monthly channels + branch leaderboard */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title={t('monthly.title')}
          description={t('monthly.description')}
        >
          <BarChart
            title={t('monthly.title')}
            data={demo.monthly}
            label={(d) => monthLabel(d.month)}
            mode="stacked"
            series={[
              { key: 'mobile', label: t('channels.mobile') },
              { key: 'internet', label: t('channels.internet') },
              { key: 'branch', label: t('channels.branch') },
              { key: 'atm', label: t('channels.atm') },
            ]}
            formatValue={count}
            formatAxis={compact}
            height={250}
          />
        </Panel>
        <Panel title={t('branches.title')} description={t('branches.description')}>
          <RankedList
            items={demo.branches.map((b) => ({
              id: b.code,
              label: b.name,
              sublabel: b.code,
              value: money(b.value),
              share: b.value / demo.branches[0]!.value,
              trend: (
                <span
                  className={b.change >= 0 ? 'text-[11px] text-success' : 'text-[11px] text-danger'}
                >
                  {b.change >= 0 ? '▲' : '▼'} {Math.abs(b.change * 100).toFixed(1)}%
                </span>
              ),
            }))}
          />
        </Panel>
      </div>

      {/* Health, limits, approvals */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Panel title={t('health.title')} description={t('health.description')}>
          <div className="flex flex-wrap items-center justify-around gap-4 py-1">
            <Gauge label={t('health.uptime')}>
              <RadialProgress
                value={demo.health.uptime}
                invert
                thresholds={{ warning: 99, danger: 99.5 }}
                label={`${demo.health.uptime}%`}
                sublabel={t('health.uptimeShort')}
              />
            </Gauge>
            <Gauge label={t('health.sla')}>
              <RadialProgress
                value={demo.health.slaWithin4h}
                invert
                thresholds={{ warning: 20, danger: 35 }}
                sublabel={t('health.slaShort')}
              />
            </Gauge>
            <Gauge label={t('health.failures')}>
              <RadialProgress
                value={demo.health.failureRate}
                max={5}
                thresholds={{ warning: 40, danger: 70 }}
                label={`${demo.health.failureRate}%`}
                sublabel={t('health.failuresShort')}
              />
            </Gauge>
          </div>
        </Panel>
        <Panel title={t('limits.title')} description={t('limits.description')}>
          <MeterList
            items={demo.limits.map((l) => ({
              id: l.key,
              label: t(`limits.${l.key}`),
              used: l.used,
              limit: l.limit,
              caption: `${money(l.used)} / ${money(l.limit)}`,
            }))}
          />
        </Panel>
        <Panel
          className="md:col-span-2 lg:col-span-1"
          title={t('pipeline.title')}
          description={t('pipeline.description')}
        >
          <StatusTracker
            className="pt-2"
            steps={[
              {
                id: 'submitted',
                label: t('pipeline.submitted'),
                count: count(demo.pipeline.submitted),
                state: 'done',
              },
              {
                id: 'checker',
                label: t('pipeline.checker'),
                count: count(demo.pipeline.checker),
                state: 'current',
                description: t('pipeline.waiting'),
              },
              {
                id: 'approved',
                label: t('pipeline.approved'),
                count: count(demo.pipeline.approved),
                state: 'upcoming',
              },
              {
                id: 'posted',
                label: t('pipeline.posted'),
                count: count(demo.pipeline.posted),
                state: 'upcoming',
              },
            ]}
          />
        </Panel>
      </div>

      {/* Heatmap + timeline */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title={t('heat.title')}
          description={t('heat.description')}
        >
          <Heatmap
            title={t('heat.title')}
            rows={weekdays}
            columns={hours}
            values={demo.heat}
            formatValue={count}
          />
          <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-subtle-foreground">
            {t('heat.less')}
            {[0.15, 0.35, 0.6, 0.8, 1].map((o) => (
              <span
                key={o}
                className="size-3 rounded-[min(var(--radius-item),4px)] bg-primary"
                style={{ opacity: o }}
                aria-hidden
              />
            ))}
            {t('heat.more')}
          </div>
        </Panel>
        <Panel title={t('events.title')} description={t('events.description')}>
          <Timeline
            items={demo.events.map((e) => ({
              id: e.id,
              icon: eventIcon[e.kind]!.icon,
              tone: eventIcon[e.kind]!.tone,
              title: t(`events.${e.kind}`, { amount: e.amount ? money(e.amount) : '' }),
              description: `${e.ref} · @${e.actor}`,
              time: <RelativeTime value={new Date(now - e.minutesAgo * 60_000)} locale={locale} />,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
