'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Package,
  PackageCheck,
  Route,
  Star,
  Timer,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { BarChart, DonutChart, SemiGauge, StackedBar } from '@/shared/ui/charts';
import { Avatar } from '@/shared/ui/menu';
import {
  CompactTable,
  DeltaBadge,
  EntityList,
  IconTile,
  ProgressBar,
  StatusTracker,
  WidgetCard,
  type CompactColumn,
  type WidgetTone,
} from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { LogisticsDashboard, VehicleStatus } from '../../types';
import { Figure, GRID, MetricCard, type DashboardViewProps, type Translate } from './parts';

const VEHICLE_TONE: Record<VehicleStatus, BadgeTone> = {
  onTime: 'success',
  delayed: 'warning',
  issue: 'danger',
};

/** Route progress: on-time trips use the brand colour. */
const PROGRESS_TONE: Record<VehicleStatus, 'danger' | 'warning' | 'primary'> = {
  onTime: 'primary',
  delayed: 'warning',
  issue: 'danger',
};

function stepState(index: number, current: number): 'done' | 'current' | 'upcoming' {
  if (index < current) return 'done';
  return index === current ? 'current' : 'upcoming';
}

function vehicleColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<LogisticsDashboard['vehicles'][number]>[] {
  return [
    {
      id: 'vehicle',
      header: t('vehicles.vehicle'),
      rowHeader: true,
      cell: (v) => (
        <span className="flex items-center gap-2.5">
          <IconTile icon={<Truck />} tone="secondary" size={30} />
          <span className="font-medium whitespace-nowrap tabular">{v.id}</span>
        </span>
      ),
    },
    {
      id: 'driver',
      header: t('vehicles.driver'),
      hideBelow: 'md',
      cell: (v) => (
        <span className="flex items-center gap-2">
          <Avatar name={v.driver} size={24} />
          <span className="truncate">{v.driver}</span>
        </span>
      ),
    },
    {
      id: 'route',
      header: t('vehicles.route'),
      cell: (v) => (
        <span className="whitespace-nowrap text-muted-foreground">{`${v.from} → ${v.to}`}</span>
      ),
    },
    {
      id: 'status',
      header: t('vehicles.status'),
      cell: (v) => (
        <Badge tone={VEHICLE_TONE[v.status]} dot>
          {t(`vehicles.${v.status}`)}
        </Badge>
      ),
    },
    {
      id: 'progress',
      header: t('vehicles.progress'),
      className: 'w-44',
      hideBelow: 'sm',
      cell: (v) => (
        <span className="flex items-center gap-2">
          <ProgressBar
            value={v.progress}
            tone={PROGRESS_TONE[v.status]}
            label={t('vehicles.progress')}
          />
          <span className="w-9 text-end text-xs tabular">{f.percent(v.progress, 0)}</span>
        </span>
      ),
    },
    {
      id: 'eta',
      header: t('vehicles.eta'),
      align: 'end',
      hideBelow: 'lg',
      cell: (v) => <span className="whitespace-nowrap tabular">{f.dayTime(v.eta)}</span>,
    },
  ];
}

type PerformanceKey = LogisticsDashboard['performance'][number]['key'];
const PERFORMANCE: Record<
  PerformanceKey,
  {
    icon: ReactNode;
    tone: WidgetTone;
    positiveIsGood: boolean;
    format: (f: DashboardFormat, v: number) => string;
  }
> = {
  inTransit: {
    icon: <Truck />,
    tone: 'primary',
    positiveIsGood: true,
    format: (f, v) => f.count(v),
  },
  outForDelivery: {
    icon: <Package />,
    tone: 'info',
    positiveIsGood: true,
    format: (f, v) => f.count(v),
  },
  delivered: {
    icon: <PackageCheck />,
    tone: 'success',
    positiveIsGood: true,
    format: (f, v) => f.count(v),
  },
  successRate: {
    icon: <CheckCircle2 />,
    tone: 'secondary',
    positiveIsGood: true,
    format: (f, v) => f.percent(v),
  },
  avgDeliveryHours: {
    icon: <Timer />,
    tone: 'warning',
    positiveIsGood: false,
    format: (f, v) => f.hours(v),
  },
  rating: { icon: <Star />, tone: 'warning', positiveIsGood: true, format: (f, v) => f.decimal(v) },
};

/** Logistics: fleet status, shipments, delivery performance, exceptions, live shipment and vehicles. */
export function LogisticsDashboardView({
  data,
  range,
}: Readonly<DashboardViewProps<LogisticsDashboard>>) {
  const t = useTranslations('dashboards.logistics');
  const f = useDashboardFormat();
  const { kpis, tracked } = data;
  const currentIndex = tracked.steps.findIndex((s) => s.step === tracked.current);

  return (
    <div className="space-y-5">
      <div className={GRID.kpis}>
        <MetricCard
          label={t('kpi.onRoute')}
          metric={kpis.onRoute}
          format={f.count}
          range={range}
          icon={<Truck />}
          tone="primary"
        />
        <MetricCard
          label={t('kpi.withErrors')}
          metric={kpis.withErrors}
          format={f.count}
          range={range}
          icon={<AlertTriangle />}
          tone="danger"
          positiveIsGood={false}
        />
        <MetricCard
          label={t('kpi.deviated')}
          metric={kpis.deviated}
          format={f.count}
          range={range}
          icon={<Route />}
          tone="warning"
          positiveIsGood={false}
        />
        <MetricCard
          label={t('kpi.late')}
          metric={kpis.late}
          format={f.count}
          range={range}
          icon={<Clock />}
          tone="info"
          positiveIsGood={false}
        />
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('fleet.title')}
          description={t('fleet.description')}
        >
          <StackedBar
            segments={data.fleet.map((s) => ({ label: t(`fleet.${s.key}`), value: s.vehicles }))}
            formatValue={f.count}
            height={30}
          />
          <EntityList
            dividers
            className="mt-4"
            items={data.fleet.map((s) => ({
              id: s.key,
              title: t(`fleet.${s.key}`),
              subtitle: t('fleet.vehicles', { count: s.vehicles }),
              value: f.hours(s.hours),
              meta: t('fleet.avgTime'),
            }))}
          />
        </WidgetCard>
        <WidgetCard title={t('onTime.title')} description={t('onTime.description')}>
          <div className="flex flex-col items-center gap-4 pt-1">
            <SemiGauge
              value={data.onTime * 100}
              min={50}
              max={100}
              bands={[
                { to: 80, tone: 'danger' },
                { to: 90, tone: 'warning' },
                { to: 100, tone: 'success' },
              ]}
              formatValue={(v) => f.percent(v / 100)}
              sublabel={t('onTime.label')}
            />
            <dl className="grid w-full grid-cols-2 gap-3">
              <Figure label={t('onTime.target')} value={f.percent(0.9, 0)} />
              <Figure
                label={t('onTime.gap')}
                value={`${data.onTime >= 0.9 ? '+' : ''}${f.decimal((data.onTime - 0.9) * 100)} pp`}
                tone={data.onTime >= 0.9 ? 'success' : 'danger'}
              />
            </dl>
          </div>
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('shipments.title')}
          description={t('shipments.description')}
        >
          <BarChart
            title={t('shipments.title')}
            data={data.shipments}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'shipped', label: t('shipments.shipped') },
              { key: 'delivered', label: t('shipments.delivered'), color: 'var(--chart-3)' },
            ]}
            formatValue={f.count}
            formatAxis={f.compact}
            height={280}
          />
        </WidgetCard>
        <WidgetCard title={t('performance.title')} description={t('performance.description')}>
          <EntityList
            items={data.performance.map((p) => {
              const meta = PERFORMANCE[p.key];
              return {
                id: p.key,
                leading: <IconTile icon={meta.icon} tone={meta.tone} size={34} />,
                title: t(`performance.${p.key}`),
                value: meta.format(f, p.value),
                meta: (
                  <DeltaBadge
                    value={p.change}
                    positiveIsGood={meta.positiveIsGood}
                    variant="text"
                  />
                ),
              };
            })}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('tracking.title', { id: tracked.id })}
          description={t('tracking.route', { from: tracked.from, to: tracked.to })}
          action={
            <Badge tone="info" dot>
              {t(`step.${tracked.current}`)}
            </Badge>
          }
        >
          <StatusTracker
            className="pt-2"
            steps={tracked.steps.map((s, i) => ({
              id: s.step,
              label: t(`step.${s.step}`),
              state: stepState(i, currentIndex),
              description: s.at ? f.dayTime(s.at) : t('tracking.pending'),
            }))}
          />
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-item bg-surface-muted px-4 py-3 text-xs">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-success" aria-hidden />
              {tracked.from}
            </span>
            <Navigation className="size-3.5 rotate-90 text-subtle-foreground" aria-hidden />
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-danger" aria-hidden />
              {tracked.to}
            </span>
          </div>
        </WidgetCard>
        <WidgetCard title={t('exceptions.title')} description={t('exceptions.description')}>
          <DonutChart
            title={t('exceptions.title')}
            data={data.exceptions.map((e) => ({ label: t(`exceptions.${e.key}`), value: e.value }))}
            centerLabel={t('exceptions.total')}
            centerValue={f.count(data.exceptions.reduce((a, e) => a + e.value, 0))}
            formatValue={f.count}
            legend="bottom"
            size={160}
          />
        </WidgetCard>
      </div>

      <WidgetCard title={t('vehicles.title')} description={t('vehicles.description')} flush>
        <CompactTable
          caption={t('vehicles.title')}
          rows={data.vehicles}
          rowKey={(v) => v.id}
          columns={vehicleColumns(t, f)}
        />
      </WidgetCard>
    </div>
  );
}
