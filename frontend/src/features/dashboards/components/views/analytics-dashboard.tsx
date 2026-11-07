'use client';

import { Clock, Eye, MousePointerClick, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DonutChart,
  FunnelChart,
  Heatmap,
  RadialProgress,
  StackedBar,
  TrendChart,
} from '@/shared/ui/charts';
import {
  CompactTable,
  DeltaBadge,
  EntityList,
  ProgressBar,
  RankedList,
  WidgetCard,
  type CompactColumn,
} from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { AnalyticsDashboard } from '../../types';
import { Figure, GRID, MetricCard, type DashboardViewProps, type Translate } from './parts';

/** A high bounce rate is bad: above half danger, above 35 % warning. */
function bounceTone(bounce: number): 'danger' | 'warning' | 'success' {
  if (bounce > 0.5) return 'danger';
  return bounce > 0.35 ? 'warning' : 'success';
}

function pageColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<AnalyticsDashboard['pages'][number]>[] {
  return [
    {
      id: 'path',
      header: t('pages.path'),
      rowHeader: true,
      cell: (p) => <code className="text-xs font-medium">{p.path}</code>,
    },
    {
      id: 'views',
      header: t('pages.views'),
      align: 'end',
      cell: (p) => <span className="font-semibold tabular">{f.count(p.views)}</span>,
    },
    {
      id: 'time',
      header: t('pages.avgTime'),
      align: 'end',
      hideBelow: 'sm',
      cell: (p) => <span className="tabular text-muted-foreground">{f.duration(p.avgTime)}</span>,
    },
    {
      id: 'bounce',
      header: t('pages.bounce'),
      className: 'w-36',
      hideBelow: 'md',
      cell: (p) => (
        <span className="flex items-center gap-2">
          <ProgressBar value={p.bounce} tone={bounceTone(p.bounce)} label={t('pages.bounce')} />
          <span className="w-10 text-end text-xs tabular">{f.percent(p.bounce, 0)}</span>
        </span>
      ),
    },
  ];
}

/** Analytics: audience KPIs, traffic, sources, engagement heatmap, pages, geography, campaigns. */
export function AnalyticsDashboardView({
  data,
  range,
}: Readonly<DashboardViewProps<AnalyticsDashboard>>) {
  const t = useTranslations('dashboards.analytics');
  const f = useDashboardFormat();
  const { kpis, goal } = data;
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

  return (
    <div className="space-y-5">
      <div className={GRID.kpis}>
        <MetricCard
          label={t('kpi.visitors')}
          metric={kpis.visitors}
          format={f.compact}
          range={range}
          icon={<Users />}
          tone="primary"
        />
        <MetricCard
          label={t('kpi.sessions')}
          metric={kpis.sessions}
          format={f.compact}
          range={range}
          icon={<Eye />}
          tone="info"
        />
        <MetricCard
          label={t('kpi.bounceRate')}
          metric={kpis.bounceRate}
          format={(v) => f.percent(v)}
          range={range}
          icon={<MousePointerClick />}
          tone="warning"
          positiveIsGood={false}
        />
        <MetricCard
          label={t('kpi.avgDuration')}
          metric={kpis.avgDuration}
          format={f.duration}
          range={range}
          icon={<Clock />}
          tone="success"
        />
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('traffic.title')}
          description={t('traffic.description')}
        >
          <TrendChart
            title={t('traffic.title')}
            data={data.traffic}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'pageViews', label: t('traffic.pageViews'), color: 'var(--chart-4)' },
              { key: 'visitors', label: t('traffic.visitors') },
            ]}
            formatValue={f.count}
            formatAxis={f.compact}
            height={300}
          />
        </WidgetCard>
        <WidgetCard title={t('sources.title')} description={t('sources.description')}>
          <DonutChart
            title={t('sources.title')}
            data={data.sources.map((s) => ({ label: t(`sources.${s.key}`), value: s.value }))}
            centerLabel={t('sources.visits')}
            centerValue={f.compact(data.sources.reduce((a, s) => a + s.value, 0))}
            formatValue={f.count}
            legend="bottom"
            size={168}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('heat.title')}
          description={t('heat.description')}
        >
          <Heatmap
            title={t('heat.title')}
            rows={f.weekdays}
            columns={hours}
            values={data.heat}
            formatValue={f.count}
          />
        </WidgetCard>
        <WidgetCard title={t('goal.title')} description={t('goal.description')}>
          <div className="flex flex-col items-center gap-4">
            <RadialProgress
              value={(goal.completed / goal.target) * 100}
              invert
              thresholds={{ warning: 20, danger: 40 }}
              label={f.percent(goal.completed / goal.target, 0)}
              sublabel={t('goal.ofTarget')}
              size={132}
            />
            <dl className="grid w-full grid-cols-2 gap-3">
              <Figure label={t('goal.completed')} value={f.count(goal.completed)} />
              <Figure label={t('goal.target')} value={f.count(goal.target)} />
            </dl>
            <div className="w-full">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t('devices.title')}
              </p>
              <StackedBar
                segments={data.devices.map((d) => ({
                  label: t(`devices.${d.key}`),
                  value: d.value,
                }))}
                formatValue={(v) => `${v}%`}
                height={14}
              />
            </div>
          </div>
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('pages.title')}
          description={t('pages.description')}
          flush
        >
          <CompactTable
            caption={t('pages.title')}
            rows={data.pages}
            rowKey={(p) => p.path}
            columns={pageColumns(t, f)}
          />
        </WidgetCard>
        <WidgetCard title={t('countries.title')} description={t('countries.description')}>
          <EntityList
            items={data.countries.slice(0, 6).map((c) => ({
              id: c.code,
              leading: (
                <span className="flex h-7 w-9 items-center justify-center rounded-item bg-secondary-soft text-[11px] font-bold text-secondary">
                  {c.code}
                </span>
              ),
              title: f.country(c.code),
              value: f.compact(c.value),
              meta: <DeltaBadge value={c.change} variant="text" />,
            }))}
          />
        </WidgetCard>
      </div>

      <div className={GRID.two}>
        <WidgetCard title={t('campaign.title')} description={t('campaign.description')}>
          <FunnelChart
            stages={data.campaign.map((c) => ({ label: t(`campaign.${c.key}`), value: c.value }))}
            formatValue={f.count}
            labels={{ conversion: t('campaign.conversion'), overall: t('campaign.overall') }}
          />
        </WidgetCard>
        <WidgetCard title={t('browsers.title')} description={t('browsers.description')}>
          <RankedList
            items={data.browsers.map((b) => ({
              id: b.name,
              label: b.name,
              value: f.compact(b.value),
              share: b.value / data.browsers[0]!.value,
              trend: <DeltaBadge value={b.change} variant="text" />,
            }))}
          />
        </WidgetCard>
      </div>
    </div>
  );
}
