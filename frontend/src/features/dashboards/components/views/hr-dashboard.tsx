'use client';

import { Briefcase, Cake, LogOut, Palmtree, PartyPopper, UserPlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/shared/ui/badge';
import { BarChart, DonutChart, FunnelChart, RadarChart } from '@/shared/ui/charts';
import {
  CompactTable,
  DeltaBadge,
  RankedList,
  Timeline,
  WidgetCard,
  type CompactColumn,
  type TimelineItem,
} from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { HrDashboard } from '../../types';
import { GRID, MetricCard, type DashboardViewProps, type Translate } from './parts';

const CALENDAR: Record<
  HrDashboard['calendar'][number]['kind'],
  { icon: ReactNode; tone: TimelineItem['tone'] }
> = {
  onboarding: { icon: <UserPlus />, tone: 'primary' },
  birthday: { icon: <Cake />, tone: 'danger' },
  leave: { icon: <Palmtree />, tone: 'info' },
  anniversary: { icon: <PartyPopper />, tone: 'success' },
};

function roleColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<HrDashboard['roles'][number]>[] {
  return [
    {
      id: 'title',
      header: t('roles.role'),
      rowHeader: true,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{r.title}</span>
          <span className="block text-xs text-subtle-foreground">{r.id}</span>
        </span>
      ),
    },
    {
      id: 'department',
      header: t('roles.department'),
      hideBelow: 'sm',
      cell: (r) => <Badge tone="secondary">{t(`department.${r.department}`)}</Badge>,
    },
    {
      id: 'applicants',
      header: t('roles.applicants'),
      align: 'end',
      cell: (r) => <span className="font-semibold tabular">{f.count(r.applicants)}</span>,
    },
    {
      id: 'posted',
      header: t('roles.posted'),
      align: 'end',
      hideBelow: 'md',
      cell: (r) => <span className="text-muted-foreground tabular">{f.shortDate(r.postedAt)}</span>,
    },
  ];
}

/** HR / people: headcount, hiring and exits, departments, recruitment, engagement, roles and calendar. */
export function HrDashboardView({ data, range }: Readonly<DashboardViewProps<HrDashboard>>) {
  const t = useTranslations('dashboards.hr');
  const f = useDashboardFormat();
  const { kpis } = data;
  const departments = [...data.departments].sort((a, b) => b.employees - a.employees);
  const calendar = [...data.calendar].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="space-y-5">
      <div className={GRID.kpis}>
        <MetricCard
          label={t('kpi.headcount')}
          metric={kpis.headcount}
          format={f.count}
          range={range}
          icon={<Users />}
          tone="primary"
        />
        <MetricCard
          label={t('kpi.hires')}
          metric={kpis.hires}
          format={f.count}
          range={range}
          icon={<UserPlus />}
          tone="success"
        />
        <MetricCard
          label={t('kpi.attrition')}
          metric={kpis.attrition}
          format={(v) => f.percent(v)}
          range={range}
          icon={<LogOut />}
          tone="danger"
          positiveIsGood={false}
        />
        <MetricCard
          label={t('kpi.openRoles')}
          metric={kpis.openRoles}
          format={f.count}
          range={range}
          icon={<Briefcase />}
          tone="info"
        />
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('movement.title')}
          description={t('movement.description')}
        >
          <BarChart
            title={t('movement.title')}
            data={data.movement}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'hires', label: t('movement.hires'), color: 'var(--success)' },
              { key: 'exits', label: t('movement.exits'), color: 'var(--danger)' },
            ]}
            formatValue={f.count}
            height={280}
          />
        </WidgetCard>
        <WidgetCard title={t('contracts.title')} description={t('contracts.description')}>
          <DonutChart
            title={t('contracts.title')}
            data={data.contracts.map((c) => ({ label: t(`contracts.${c.key}`), value: c.value }))}
            centerLabel={t('contracts.employees')}
            centerValue={f.count(data.contracts.reduce((a, c) => a + c.value, 0))}
            formatValue={f.count}
            legend="bottom"
            size={160}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard title={t('departments.title')} description={t('departments.description')}>
          <RankedList
            items={departments.map((d) => ({
              id: d.key,
              label: t(`department.${d.key}`),
              value: f.count(d.employees),
              share: d.employees / departments[0]!.employees,
              trend: <DeltaBadge value={d.change} variant="text" />,
            }))}
          />
        </WidgetCard>
        <WidgetCard title={t('recruitment.title')} description={t('recruitment.description')}>
          <FunnelChart
            stages={data.recruitment.map((s) => ({
              label: t(`recruitment.${s.key}`),
              value: s.value,
            }))}
            formatValue={f.count}
            labels={{ conversion: t('recruitment.conversion'), overall: t('recruitment.overall') }}
          />
        </WidgetCard>
        <WidgetCard title={t('engagement.title')} description={t('engagement.description')}>
          <RadarChart
            title={t('engagement.title')}
            axes={data.engagement.axes.map((a) => t(`engagement.${a}`))}
            series={[
              { key: 'current', label: t('engagement.current') },
              { key: 'previous', label: t('engagement.previous'), color: 'var(--chart-4)' },
            ]}
            values={{ current: data.engagement.current, previous: data.engagement.previous }}
            formatValue={(v) => `${v}/100`}
            size={260}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('roles.title')}
          description={t('roles.description')}
          flush
        >
          <CompactTable
            caption={t('roles.title')}
            rows={data.roles}
            rowKey={(r) => r.id}
            columns={roleColumns(t, f)}
          />
        </WidgetCard>
        <WidgetCard title={t('calendar.title')} description={t('calendar.description')}>
          <Timeline
            items={calendar.map((e) => ({
              id: e.id,
              icon: CALENDAR[e.kind].icon,
              tone: CALENDAR[e.kind].tone,
              title: t(`calendar.${e.kind}`, { name: e.name }),
              time: f.shortDate(e.at),
            }))}
          />
        </WidgetCard>
      </div>

      <WidgetCard title={t('tenure.title')} description={t('tenure.description')}>
        <BarChart
          title={t('tenure.title')}
          data={data.tenure}
          label={(d) => t(`tenure.${d.key}`)}
          series={[{ key: 'value', label: t('tenure.employees'), color: 'var(--chart-2)' }]}
          formatValue={f.count}
          showLegend={false}
          height={220}
        />
      </WidgetCard>
    </div>
  );
}
