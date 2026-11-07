'use client';

import { Banknote, PiggyBank, Receipt, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { DonutChart, SemiGauge, StackedBar, TrendChart, WaterfallChart } from '@/shared/ui/charts';
import { Avatar } from '@/shared/ui/menu';
import { CompactTable, ProgressBar, WidgetCard, type CompactColumn } from '@/shared/ui/widgets';
import { useDashboardFormat, type DashboardFormat } from '../../hooks/use-dashboard-format';
import type { FinanceDashboard, InvoiceStatus } from '../../types';
import { Figure, GRID, MetricCard, type DashboardViewProps, type Translate } from './parts';

const INVOICE_TONE: Record<InvoiceStatus, BadgeTone> = {
  paid: 'success',
  pending: 'warning',
  overdue: 'danger',
  draft: 'neutral',
};

const BUDGET_TEXT = {
  danger: 'font-semibold text-danger',
  warning: 'font-semibold text-warning',
  success: 'font-semibold text-success',
} as const;

/** Spent share of a budget: over it danger, above 90 % warning. */
function budgetTone(ratio: number): keyof typeof BUDGET_TEXT {
  if (ratio > 1) return 'danger';
  return ratio > 0.9 ? 'warning' : 'success';
}

function invoiceColumns(
  t: Translate,
  f: DashboardFormat,
): CompactColumn<FinanceDashboard['invoices'][number]>[] {
  return [
    {
      id: 'id',
      header: t('invoices.invoice'),
      cell: (i) => <span className="font-medium tabular">{i.id}</span>,
    },
    {
      id: 'customer',
      header: t('invoices.customer'),
      rowHeader: true,
      cell: (i) => (
        <span className="flex items-center gap-2">
          <Avatar name={i.customer} size={26} variant="solid" />
          <span className="truncate">{i.customer}</span>
        </span>
      ),
    },
    {
      id: 'due',
      header: t('invoices.due'),
      hideBelow: 'sm',
      cell: (i) => <span className="text-muted-foreground tabular">{f.shortDate(i.dueDate)}</span>,
    },
    {
      id: 'status',
      header: t('invoices.status'),
      cell: (i) => (
        <Badge tone={INVOICE_TONE[i.status]} dot>
          {t(`invoices.${i.status}`)}
        </Badge>
      ),
    },
    {
      id: 'amount',
      header: t('invoices.amount'),
      align: 'end',
      cell: (i) => <span className="font-semibold tabular">{f.money(i.amount)}</span>,
    },
  ];
}

/** Finance: P&L figures, cash flow, profit bridge, spend, budgets, receivables and invoices. */
export function FinanceDashboardView({
  data,
  range,
}: Readonly<DashboardViewProps<FinanceDashboard>>) {
  const t = useTranslations('dashboards.finance');
  const f = useDashboardFormat();
  const { kpis, ratios } = data;
  const overdue = data.aging.filter((a) => a.key !== 'current').reduce((s, a) => s + a.value, 0);
  const receivable = data.aging.reduce((s, a) => s + a.value, 0);

  return (
    <div className="space-y-5">
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
          label={t('kpi.expenses')}
          metric={kpis.expenses}
          format={f.moneyCompact}
          range={range}
          icon={<Receipt />}
          tone="danger"
          positiveIsGood={false}
        />
        <MetricCard
          label={t('kpi.netProfit')}
          metric={kpis.netProfit}
          format={f.moneyCompact}
          range={range}
          icon={<PiggyBank />}
          tone="success"
        />
        <MetricCard
          label={t('kpi.cash')}
          metric={kpis.cash}
          format={f.moneyCompact}
          range={range}
          icon={<Wallet />}
          tone="info"
        />
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('cashflow.title')}
          description={t('cashflow.description')}
        >
          <TrendChart
            title={t('cashflow.title')}
            data={data.cashflow}
            label={(d) => f.bucket(d.date, data.granularity)}
            series={[
              { key: 'inflow', label: t('cashflow.inflow'), color: 'var(--success)' },
              { key: 'outflow', label: t('cashflow.outflow'), color: 'var(--danger)' },
            ]}
            formatValue={f.money}
            formatAxis={f.compact}
            height={300}
          />
        </WidgetCard>
        <WidgetCard title={t('ratios.title')} description={t('ratios.description')}>
          <div className="flex flex-col items-center gap-4 pt-1">
            <SemiGauge
              value={ratios.current}
              min={0}
              max={3}
              bands={[
                { to: 1, tone: 'danger' },
                { to: 1.5, tone: 'warning' },
                { to: 3, tone: 'success' },
              ]}
              formatValue={(v) => f.decimal(v, 2)}
              sublabel={t('ratios.current')}
            />
            <dl className="grid w-full grid-cols-3 gap-2">
              <Figure
                label={t('ratios.quick')}
                value={f.decimal(ratios.quick, 2)}
                tone={ratios.quick >= 1 ? 'success' : 'danger'}
              />
              <Figure label={t('ratios.grossMargin')} value={f.percent(ratios.grossMargin)} />
              <Figure
                label={t('ratios.dso')}
                value={f.days(ratios.dso)}
                tone={ratios.dso > 45 ? 'warning' : undefined}
              />
            </dl>
          </div>
        </WidgetCard>
      </div>

      <div className={GRID.three}>
        <WidgetCard
          className={GRID.wide}
          title={t('bridge.title')}
          description={t('bridge.description')}
        >
          <WaterfallChart
            title={t('bridge.title')}
            steps={data.bridge.map((b) => ({
              label: t(`bridge.${b.key}`),
              value: b.value,
              total: b.total,
            }))}
            formatValue={f.moneyCompact}
            formatAxis={f.compact}
            labels={{
              total: t('bridge.total'),
              increase: t('bridge.increase'),
              decrease: t('bridge.decrease'),
            }}
          />
        </WidgetCard>
        <WidgetCard title={t('expenses.title')} description={t('expenses.description')}>
          <DonutChart
            title={t('expenses.title')}
            data={data.expenses.map((e) => ({ label: t(`expenses.${e.key}`), value: e.value }))}
            centerLabel={t('expenses.total')}
            centerValue={f.moneyCompact(data.expenses.reduce((a, e) => a + e.value, 0))}
            formatValue={f.moneyCompact}
            legend="bottom"
            size={160}
          />
        </WidgetCard>
      </div>

      <div className={GRID.two}>
        <WidgetCard title={t('budget.title')} description={t('budget.description')}>
          <ul className="space-y-4">
            {data.budget.map((b) => {
              const ratio = b.actual / b.budget;
              const tone = budgetTone(ratio);
              return (
                <li key={b.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{t(`budget.${b.key}`)}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {t('budget.of', {
                        actual: f.moneyCompact(b.actual),
                        budget: f.moneyCompact(b.budget),
                      })}{' '}
                      <span className={BUDGET_TEXT[tone]}>{f.percent(ratio, 0)}</span>
                    </span>
                  </div>
                  <ProgressBar value={ratio} tone={tone} size="md" label={t(`budget.${b.key}`)} />
                </li>
              );
            })}
          </ul>
        </WidgetCard>
        <WidgetCard title={t('aging.title')} description={t('aging.description')}>
          <dl className="mb-5 grid grid-cols-2 gap-3">
            <Figure label={t('aging.receivable')} value={f.moneyCompact(receivable)} />
            <Figure
              label={t('aging.overdue')}
              value={f.moneyCompact(overdue)}
              tone={overdue / receivable > 0.3 ? 'danger' : 'warning'}
            />
          </dl>
          <StackedBar
            segments={data.aging.map((a, i) => ({
              label: t(`aging.${a.key}`),
              value: a.value,
              color: [
                'var(--success)',
                'var(--chart-4)',
                'var(--chart-5)',
                'var(--chart-6)',
                'var(--danger)',
              ][i],
            }))}
            formatValue={f.moneyCompact}
            height={22}
          />
        </WidgetCard>
      </div>

      <WidgetCard title={t('invoices.title')} description={t('invoices.description')} flush>
        <CompactTable
          caption={t('invoices.title')}
          rows={data.invoices}
          rowKey={(i) => i.id}
          columns={invoiceColumns(t, f)}
        />
      </WidgetCard>
    </div>
  );
}
