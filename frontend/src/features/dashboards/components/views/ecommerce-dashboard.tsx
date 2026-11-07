'use client';

import {
  Banknote,
  Box,
  PackageSearch,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { BarChart, DonutChart, FunnelChart, StackedBar } from '@/shared/ui/charts';
import { Avatar } from '@/shared/ui/menu';
import { RelativeTime } from '@/shared/ui/relative-time';
import {
  CompactTable,
  DeltaBadge,
  EntityList,
  HeroCard,
  IconTile,
  ProgressBar,
  StatGrid,
  WidgetCard,
  type CompactColumn,
} from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { EcommerceDashboard, OrderStatus } from '../../types';
import { GRID, MetricCard, metricDelta, type DashboardViewProps, type Translate } from './parts';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  delivered: 'success',
  shipped: 'info',
  processing: 'primary',
  pending: 'warning',
  cancelled: 'neutral',
  returned: 'danger',
};

const TEXT_TONE = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
} as const;

/** Stock left as a share of capacity: under 10 % danger, under 25 % warning. */
function stockTone(ratio: number): keyof typeof TEXT_TONE {
  if (ratio < 0.1) return 'danger';
  return ratio < 0.25 ? 'warning' : 'success';
}

function orderColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<EcommerceDashboard['orders'][number]>[] {
  return [
    {
      id: 'id',
      header: t('orders.order'),
      cell: (o) => <span className="font-medium tabular">{o.id}</span>,
    },
    {
      id: 'customer',
      header: t('orders.customer'),
      rowHeader: true,
      cell: (o) => (
        <span className="flex items-center gap-2">
          <Avatar name={o.customer} size={26} />
          <span className="truncate">{o.customer}</span>
        </span>
      ),
    },
    {
      id: 'payment',
      header: t('orders.payment'),
      hideBelow: 'lg',
      cell: (o) => <span className="text-muted-foreground">{t(`payment.${o.payment}`)}</span>,
    },
    {
      id: 'status',
      header: t('orders.status'),
      cell: (o) => (
        <Badge tone={STATUS_TONE[o.status]} dot>
          {t(`status.${o.status}`)}
        </Badge>
      ),
    },
    {
      id: 'total',
      header: t('orders.total'),
      align: 'end',
      cell: (o) => <span className="font-semibold tabular">{f.money(o.total)}</span>,
    },
    {
      id: 'placed',
      header: t('orders.placed'),
      align: 'end',
      hideBelow: 'md',
      cell: (o) => (
        <RelativeTime
          value={o.placedAt}
          locale={f.locale}
          className="text-xs whitespace-nowrap text-subtle-foreground"
        />
      ),
    },
  ];
}

/** eCommerce: sales highlight, revenue vs expenses, orders, products, inventory and conversion. */
export function EcommerceDashboardView({
  data,
  range,
}: Readonly<DashboardViewProps<EcommerceDashboard>>) {
  const t = useTranslations('dashboards.ecommerce');
  const f = useDashboardFormat();
  const { highlight, kpis, totals } = data;

  return (
    <div className="space-y-5">
      <div className={GRID.three}>
        <HeroCard
          tone="secondary"
          eyebrow={t('hero.eyebrow')}
          title={t('hero.title')}
          description={t('hero.description', { product: highlight.product })}
          value={f.moneyCompact(highlight.sales)}
          caption={t('hero.caption', { percent: f.percent(highlight.sales / highlight.target, 0) })}
          visual={<Sparkles />}
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
                id: 'orders',
                label: t('totals.orders'),
                value: f.compact(totals.orders.value),
                icon: <ShoppingCart />,
                tone: 'primary',
                delta: metricDelta(totals.orders),
              },
              {
                id: 'customers',
                label: t('totals.customers'),
                value: f.compact(totals.customers.value),
                icon: <Users />,
                tone: 'info',
                delta: metricDelta(totals.customers),
              },
              {
                id: 'units',
                label: t('totals.units'),
                value: f.compact(totals.units.value),
                icon: <Box />,
                tone: 'warning',
                delta: metricDelta(totals.units),
              },
              {
                id: 'revenue',
                label: t('totals.revenue'),
                value: f.moneyCompact(totals.revenue.value),
                icon: <Banknote />,
                tone: 'success',
                delta: metricDelta(totals.revenue),
              },
            ]}
          />
        </WidgetCard>
      </div>

      <div className={GRID.kpis}>
        <MetricCard
          label={t('kpi.revenue')}
          metric={kpis.revenue}
          format={f.moneyCompact}
          range={range}
          icon={<Banknote />}
          tone="primary"
        />
        <MetricCard
          label={t('kpi.orders')}
          metric={kpis.orders}
          format={f.count}
          range={range}
          icon={<ShoppingBag />}
          tone="info"
        />
        <MetricCard
          label={t('kpi.aov')}
          metric={kpis.aov}
          format={f.money}
          range={range}
          icon={<Receipt />}
          tone="success"
        />
        <MetricCard
          label={t('kpi.refundRate')}
          metric={kpis.refundRate}
          format={(v) => f.percent(v, 2)}
          range={range}
          icon={<RotateCcw />}
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
          <BarChart
            title={t('revenue.title')}
            data={data.revenue}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'revenue', label: t('revenue.revenue') },
              { key: 'expenses', label: t('revenue.expenses'), color: 'var(--chart-2)' },
            ]}
            formatValue={f.money}
            formatAxis={f.compact}
            height={280}
          />
        </WidgetCard>
        <WidgetCard title={t('statuses.title')} description={t('statuses.description')}>
          <DonutChart
            title={t('statuses.title')}
            data={data.statuses.map((s) => ({ label: t(`status.${s.key}`), value: s.value }))}
            centerLabel={t('statuses.orders')}
            centerValue={f.compact(data.statuses.reduce((a, s) => a + s.value, 0))}
            formatValue={f.count}
            legend="bottom"
            size={168}
          />
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard title={t('products.title')} description={t('products.description')}>
          <EntityList
            items={data.topProducts.slice(0, 5).map((p, i) => ({
              id: p.id,
              leading: (
                <IconTile
                  icon={<Box />}
                  tone={(['primary', 'info', 'success', 'warning', 'secondary'] as const)[i]}
                  size={36}
                />
              ),
              title: p.name,
              subtitle: t('products.units', { category: p.category, units: f.count(p.units) }),
              value: f.moneyCompact(p.revenue),
              meta: <DeltaBadge value={p.change} variant="text" />,
            }))}
          />
        </WidgetCard>
        <WidgetCard title={t('funnel.title')} description={t('funnel.description')}>
          <FunnelChart
            stages={data.funnel.map((s) => ({ label: t(`funnel.${s.key}`), value: s.value }))}
            formatValue={f.compact}
            labels={{ conversion: t('funnel.conversion'), overall: t('funnel.overall') }}
          />
        </WidgetCard>
        <WidgetCard
          title={t('inventory.title')}
          description={t('inventory.description')}
          action={<PackageSearch className="size-4 text-muted-foreground" aria-hidden />}
        >
          <ul className="space-y-3.5">
            {data.inventory.map((item) => {
              const ratio = item.stock / item.capacity;
              const tone = stockTone(ratio);
              return (
                <li key={item.sku}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">
                      {item.name}
                      <span className="ms-1.5 text-xs font-normal text-subtle-foreground">
                        {item.sku}
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold tabular ${TEXT_TONE[tone]}`}>
                      {t('inventory.left', { count: item.stock })}
                    </span>
                  </div>
                  <ProgressBar
                    value={ratio}
                    tone={tone}
                    label={t('inventory.level', { name: item.name })}
                  />
                </li>
              );
            })}
          </ul>
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('orders.title')}
          description={t('orders.description')}
          flush
        >
          <CompactTable
            caption={t('orders.title')}
            rows={data.orders}
            rowKey={(o) => o.id}
            columns={orderColumns(t, f)}
          />
        </WidgetCard>
        <WidgetCard title={t('categories.title')} description={t('categories.description')}>
          <StackedBar
            segments={data.categories.map((c) => ({
              label: t(`categories.${c.key}`),
              value: c.value,
            }))}
            formatValue={f.count}
            height={18}
          />
        </WidgetCard>
      </div>
    </div>
  );
}
