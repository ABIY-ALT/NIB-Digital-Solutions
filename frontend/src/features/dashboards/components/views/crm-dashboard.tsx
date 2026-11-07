'use client';

import {
  Briefcase,
  CalendarClock,
  FileSignature,
  Handshake,
  Mail,
  MonitorPlay,
  Percent,
  Phone,
  Trophy,
  TrendingDown,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { DonutChart, FunnelChart, RadarChart, TrendChart } from '@/shared/ui/charts';
import { Avatar } from '@/shared/ui/menu';
import {
  CompactTable,
  DeltaBadge,
  EntityList,
  HeroCard,
  RankedList,
  SegmentedControl,
  StatGrid,
  Timeline,
  WidgetCard,
  type CompactColumn,
  type TimelineItem,
} from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { CrmActivityKind, CrmDashboard, DealStage } from '../../types';
import { GRID, MetricCard, metricDelta, type DashboardViewProps, type Translate } from './parts';

const STAGE_TONE: Record<DealStage, BadgeTone> = {
  lead: 'neutral',
  qualified: 'info',
  proposal: 'primary',
  negotiation: 'warning',
  won: 'success',
};

const AGENDA: Record<CrmActivityKind, { icon: ReactNode; tone: TimelineItem['tone'] }> = {
  meeting: { icon: <Users />, tone: 'primary' },
  call: { icon: <Phone />, tone: 'info' },
  demo: { icon: <MonitorPlay />, tone: 'success' },
  contract: { icon: <FileSignature />, tone: 'warning' },
  email: { icon: <Mail />, tone: 'neutral' },
};

function dealColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<CrmDashboard['deals'][number]>[] {
  return [
    {
      id: 'company',
      header: t('deals.company'),
      rowHeader: true,
      cell: (d) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={d.company} size={28} variant="solid" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{d.company}</span>
            <span className="block text-xs text-subtle-foreground">{d.id}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'owner',
      header: t('deals.owner'),
      hideBelow: 'md',
      cell: (d) => <span className="text-muted-foreground">{d.owner}</span>,
    },
    {
      id: 'stage',
      header: t('deals.stage'),
      cell: (d) => (
        <Badge tone={STAGE_TONE[d.stage]} dot>
          {t(`stage.${d.stage}`)}
        </Badge>
      ),
    },
    {
      id: 'probability',
      header: t('deals.probability'),
      align: 'end',
      hideBelow: 'sm',
      cell: (d) => <span className="tabular">{f.percent(d.probability, 0)}</span>,
    },
    {
      id: 'amount',
      header: t('deals.amount'),
      align: 'end',
      cell: (d) => <span className="font-semibold tabular">{f.money(d.amount)}</span>,
    },
    {
      id: 'close',
      header: t('deals.close'),
      align: 'end',
      hideBelow: 'lg',
      cell: (d) => (
        <span className="text-muted-foreground tabular">{f.shortDate(d.closeDate)}</span>
      ),
    },
  ];
}

/** CRM: revenue vs target, pipeline, sources, team performance, deals and agenda. */
export function CrmDashboardView({ data, range }: Readonly<DashboardViewProps<CrmDashboard>>) {
  const t = useTranslations('dashboards.crm');
  const f = useDashboardFormat();
  const [people, setPeople] = useState<'reps' | 'regions'>('reps');
  const { highlight, totals, kpis } = data;

  return (
    <div className="space-y-5">
      <div className={GRID.three}>
        <HeroCard
          eyebrow={t('hero.eyebrow')}
          title={t('hero.title', { name: highlight.name.split(' ')[0]! })}
          description={t('hero.description', { deals: highlight.dealsWon })}
          value={f.moneyCompact(highlight.revenue)}
          caption={t('hero.caption', {
            percent: f.percent(highlight.revenue / highlight.target, 0),
          })}
          visual={<Trophy />}
        />
        <WidgetCard
          className={GRID.wide}
          title={t('totals.title')}
          description={t('totals.description')}
        >
          <StatGrid
            className="pt-1"
            items={[
              {
                id: 'revenue',
                label: t('totals.revenue'),
                value: f.moneyCompact(totals.revenue.value),
                icon: <Wallet />,
                tone: 'primary',
                delta: metricDelta(totals.revenue),
              },
              {
                id: 'customers',
                label: t('totals.customers'),
                value: f.compact(totals.customers.value),
                icon: <Users />,
                tone: 'success',
                delta: metricDelta(totals.customers),
              },
              {
                id: 'won',
                label: t('totals.dealsWon'),
                value: f.count(totals.dealsWon.value),
                icon: <Handshake />,
                tone: 'warning',
                delta: metricDelta(totals.dealsWon),
              },
              {
                id: 'pipeline',
                label: t('totals.pipeline'),
                value: f.moneyCompact(totals.pipeline.value),
                icon: <Briefcase />,
                tone: 'info',
                delta: metricDelta(totals.pipeline),
              },
            ]}
          />
        </WidgetCard>
      </div>

      <div className={GRID.kpis}>
        <MetricCard
          label={t('kpi.newLeads')}
          metric={kpis.newLeads}
          format={f.count}
          range={range}
          icon={<UserPlus />}
          tone="primary"
        />
        <MetricCard
          label={t('kpi.conversion')}
          metric={kpis.conversion}
          format={(v) => f.percent(v)}
          range={range}
          icon={<Percent />}
          tone="success"
        />
        <MetricCard
          label={t('kpi.avgDeal')}
          metric={kpis.avgDeal}
          format={f.moneyCompact}
          range={range}
          icon={<Wallet />}
          tone="info"
        />
        <MetricCard
          label={t('kpi.churn')}
          metric={kpis.churn}
          format={(v) => f.percent(v, 2)}
          range={range}
          icon={<TrendingDown />}
          tone="danger"
          positiveIsGood={false}
        />
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('revenue.title')}
          description={t('revenue.description')}
        >
          <TrendChart
            title={t('revenue.title')}
            data={data.revenue}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'won', label: t('revenue.won') },
              { key: 'target', label: t('revenue.target'), color: 'var(--chart-4)' },
            ]}
            formatValue={f.money}
            formatAxis={f.compact}
            height={300}
          />
        </WidgetCard>
        <WidgetCard title={t('sources.title')} description={t('sources.description')}>
          <DonutChart
            title={t('sources.title')}
            data={data.sources.map((s) => ({ label: t(`sources.${s.key}`), value: s.value }))}
            centerLabel={t('sources.leads')}
            centerValue={f.compact(data.sources.reduce((a, s) => a + s.value, 0))}
            formatValue={f.count}
            legend="bottom"
            size={168}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard title={t('funnel.title')} description={t('funnel.description')}>
          <FunnelChart
            stages={data.funnel.map((s) => ({ label: t(`stage.${s.stage}`), value: s.count }))}
            formatValue={f.count}
            labels={{ conversion: t('funnel.conversion'), overall: t('funnel.overall') }}
          />
        </WidgetCard>
        <WidgetCard title={t('performance.title')} description={t('performance.description')}>
          <RadarChart
            title={t('performance.title')}
            axes={data.performance.axes.map((a) => t(`performance.${a}`))}
            series={[
              { key: 'team', label: t('performance.team') },
              { key: 'target', label: t('performance.target'), color: 'var(--chart-4)' },
            ]}
            values={{ team: data.performance.team, target: data.performance.target }}
            formatValue={(v) => `${v}/100`}
            size={260}
          />
        </WidgetCard>
        <WidgetCard
          title={people === 'reps' ? t('reps.title') : t('regions.title')}
          description={people === 'reps' ? t('reps.description') : t('regions.description')}
          action={
            <SegmentedControl
              label={t('reps.view')}
              value={people}
              onChange={setPeople}
              options={[
                { value: 'reps', label: t('reps.tab') },
                { value: 'regions', label: t('regions.tab') },
              ]}
            />
          }
        >
          {people === 'reps' ? (
            <EntityList
              items={data.reps.slice(0, 5).map((r) => ({
                id: r.id,
                leading: <Avatar name={r.name} size={36} />,
                title: r.name,
                subtitle: t('reps.subtitle', { team: r.team, deals: r.deals }),
                value: f.moneyCompact(r.revenue),
                meta: t('reps.quota', { percent: f.percent(r.revenue / r.quota, 0) }),
              }))}
            />
          ) : (
            <RankedList
              items={data.regions.map((r) => ({
                id: r.code,
                label: r.name,
                value: f.moneyCompact(r.revenue),
                share: r.revenue / data.regions[0]!.revenue,
                trend: <DeltaBadge value={r.change} variant="text" />,
              }))}
            />
          )}
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('deals.title')}
          description={t('deals.description')}
          flush
        >
          <CompactTable
            caption={t('deals.title')}
            rows={data.deals}
            rowKey={(d) => d.id}
            columns={dealColumns(t, f)}
          />
        </WidgetCard>
        <WidgetCard
          title={t('agenda.title')}
          description={t('agenda.description')}
          action={<CalendarClock className="size-4 text-muted-foreground" aria-hidden />}
        >
          <Timeline
            items={data.agenda.map((a) => ({
              id: a.id,
              icon: AGENDA[a.kind].icon,
              tone: AGENDA[a.kind].tone,
              title: t(`agenda.${a.kind}`, { company: a.company }),
              description: a.owner,
              time: f.dayTime(a.at),
            }))}
          />
        </WidgetCard>
      </div>
    </div>
  );
}
