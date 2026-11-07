'use client';

import { CheckCheck, Inbox, SmilePlus, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { DonutChart, Heatmap, RadialProgress, StackedBar, TrendChart } from '@/shared/ui/charts';
import { Avatar } from '@/shared/ui/menu';
import { RelativeTime } from '@/shared/ui/relative-time';
import {
  CompactTable,
  EntityList,
  ProgressBar,
  WidgetCard,
  type CompactColumn,
} from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { SupportDashboard, TicketPriority, TicketStatus } from '../../types';
import { Figure, GRID, MetricCard, type DashboardViewProps, type Translate } from './parts';

const PRIORITY_TONE: Record<TicketPriority, BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'info',
  low: 'neutral',
};
const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  new: 'primary',
  open: 'info',
  pending: 'warning',
  solved: 'success',
};
const BACKLOG_TONE = ['primary', 'info', 'warning', 'secondary', 'danger'] as const;

function ticketColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<SupportDashboard['tickets'][number]>[] {
  return [
    {
      id: 'subject',
      header: t('tickets.subject'),
      rowHeader: true,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block max-w-72 truncate font-medium">{r.subject}</span>
          <span className="block text-xs text-subtle-foreground">{`${r.id} · ${r.customer}`}</span>
        </span>
      ),
    },
    {
      id: 'priority',
      header: t('tickets.priority'),
      cell: (r) => <Badge tone={PRIORITY_TONE[r.priority]}>{t(`priority.${r.priority}`)}</Badge>,
    },
    {
      id: 'status',
      header: t('tickets.status'),
      hideBelow: 'sm',
      cell: (r) => (
        <Badge tone={STATUS_TONE[r.status]} dot>
          {t(`status.${r.status}`)}
        </Badge>
      ),
    },
    {
      id: 'agent',
      header: t('tickets.agent'),
      hideBelow: 'lg',
      cell: (r) => (
        <span className="text-muted-foreground">{r.agent ?? t('tickets.unassigned')}</span>
      ),
    },
    {
      id: 'created',
      header: t('tickets.created'),
      align: 'end',
      hideBelow: 'md',
      cell: (r) => (
        <RelativeTime
          value={r.createdAt}
          locale={f.locale}
          className="text-xs whitespace-nowrap text-subtle-foreground"
        />
      ),
    },
  ];
}

/** Support desk: volume, response times, SLA, channels, backlog, satisfaction, agents and tickets. */
export function SupportDashboardView({
  data,
  range,
}: Readonly<DashboardViewProps<SupportDashboard>>) {
  const t = useTranslations('dashboards.support');
  const f = useDashboardFormat();
  const { kpis, sla } = data;
  const backlogMax = Math.max(...data.backlog.map((b) => b.value));
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

  return (
    <div className="space-y-5">
      <div className={GRID.kpis}>
        <MetricCard
          label={t('kpi.created')}
          metric={kpis.created}
          format={f.count}
          range={range}
          icon={<Inbox />}
          tone="primary"
          positiveIsGood={false}
        />
        <MetricCard
          label={t('kpi.resolved')}
          metric={kpis.resolved}
          format={f.count}
          range={range}
          icon={<CheckCheck />}
          tone="success"
        />
        <MetricCard
          label={t('kpi.firstResponse')}
          metric={kpis.firstResponse}
          format={f.minutes}
          range={range}
          icon={<Timer />}
          tone="warning"
          positiveIsGood={false}
        />
        <MetricCard
          label={t('kpi.csat')}
          metric={kpis.csat}
          format={(v) => f.percent(v)}
          range={range}
          icon={<SmilePlus />}
          tone="info"
        />
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('volume.title')}
          description={t('volume.description')}
        >
          <TrendChart
            title={t('volume.title')}
            data={data.volume}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'created', label: t('volume.created') },
              { key: 'resolved', label: t('volume.resolved'), color: 'var(--chart-3)' },
            ]}
            variant="line"
            formatValue={f.count}
            formatAxis={f.compact}
            height={290}
          />
        </WidgetCard>
        <WidgetCard title={t('sla.title')} description={t('sla.description')}>
          <div className="flex flex-col items-center gap-4">
            <RadialProgress
              value={sla.met * 100}
              invert
              thresholds={{
                warning: 100 - sla.target * 100,
                danger: 100 - (sla.target - 0.05) * 100,
              }}
              label={f.percent(sla.met)}
              sublabel={t('sla.met')}
              size={136}
              thickness={11}
            />
            <dl className="grid w-full grid-cols-2 gap-3">
              <Figure label={t('sla.target')} value={f.percent(sla.target, 0)} />
              <Figure
                label={t('sla.status')}
                value={sla.met >= sla.target ? t('sla.onTrack') : t('sla.atRisk')}
                tone={sla.met >= sla.target ? 'success' : 'danger'}
              />
            </dl>
          </div>
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard title={t('channels.title')} description={t('channels.description')}>
          <DonutChart
            title={t('channels.title')}
            data={data.channels.map((c) => ({ label: t(`channels.${c.key}`), value: c.value }))}
            centerLabel={t('channels.tickets')}
            centerValue={f.compact(data.channels.reduce((a, c) => a + c.value, 0))}
            formatValue={f.count}
            legend="bottom"
            size={156}
          />
        </WidgetCard>
        <WidgetCard title={t('backlog.title')} description={t('backlog.description')}>
          <ul className="space-y-3.5">
            {data.backlog.map((b, i) => (
              <li key={b.key}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">{t(`backlog.${b.key}`)}</span>
                  <span className="font-semibold tabular">{f.count(b.value)}</span>
                </div>
                <ProgressBar
                  value={b.value / backlogMax}
                  tone={BACKLOG_TONE[i] ?? 'primary'}
                  label={t(`backlog.${b.key}`)}
                />
              </li>
            ))}
          </ul>
        </WidgetCard>
        <WidgetCard title={t('satisfaction.title')} description={t('satisfaction.description')}>
          <p className="mb-4 text-3xl font-semibold tabular">
            {f.percent(kpis.csat.value, 0)}
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {t('satisfaction.positive')}
            </span>
          </p>
          <StackedBar
            segments={data.satisfaction.map((s, i) => ({
              label: t(`satisfaction.${s.key}`),
              value: s.value,
              color: ['var(--success)', 'var(--chart-3)', 'var(--chart-5)', 'var(--danger)'][i],
            }))}
            formatValue={f.count}
            height={18}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('tickets.title')}
          description={t('tickets.description')}
          flush
        >
          <CompactTable
            caption={t('tickets.title')}
            rows={data.tickets}
            rowKey={(r) => r.id}
            columns={ticketColumns(t, f)}
          />
        </WidgetCard>
        <WidgetCard title={t('agents.title')} description={t('agents.description')}>
          <EntityList
            items={data.agents.slice(0, 5).map((a) => ({
              id: a.id,
              leading: (
                <span className="relative">
                  <Avatar name={a.name} size={36} />
                  <span
                    className={cn(
                      'absolute -end-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface',
                      a.online ? 'bg-success' : 'bg-border-strong',
                    )}
                    aria-hidden
                  />
                </span>
              ),
              title: a.name,
              subtitle: `${a.team} · ${a.online ? t('agents.online') : t('agents.offline')}`,
              value: t('agents.resolved', { count: f.count(a.resolved) }),
              meta: t('agents.csat', { percent: f.percent(a.csat, 0) }),
            }))}
          />
        </WidgetCard>
      </div>

      <WidgetCard title={t('heat.title')} description={t('heat.description')}>
        <Heatmap
          title={t('heat.title')}
          rows={f.weekdays}
          columns={hours}
          values={data.heat}
          formatValue={f.count}
        />
      </WidgetCard>
    </div>
  );
}
