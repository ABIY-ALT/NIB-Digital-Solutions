import type { DashboardRange, FinanceDashboard, InvoiceStatus } from '../types';
import {
  COMPANIES,
  daysFrom,
  metric,
  points,
  round,
  sampleContext,
  series,
  shares,
  sum,
  type SampleContext,
} from './sample-kit';

/** Days from today to an invoice's due date: in the past for overdue and paid ones. */
function dueInDays(status: InvoiceStatus, s: SampleContext['s']): number {
  if (status === 'overdue') return -s.int(3, 40);
  return status === 'paid' ? -s.int(1, 20) : s.int(2, 45);
}

export function financeSample(range: DashboardRange, now: Date): FinanceDashboard {
  const ctx = sampleContext('finance', range, now);
  const { s } = ctx;
  const inflow = series(ctx, 410_000, { growth: 0.16, weekendDip: 0.6 });
  const outflow = inflow.map((v) => Math.round(v * s.between(0.72, 0.95)));
  const revenue = sum(inflow);
  const cogs = Math.round(revenue * s.between(0.38, 0.44));
  const opex = Math.round(revenue * s.between(0.14, 0.18));
  const payroll = Math.round(revenue * s.between(0.17, 0.21));
  const tax = Math.round((revenue - cogs - opex - payroll) * 0.3);
  const net = revenue - cogs - opex - payroll - tax;
  const statuses: InvoiceStatus[] = [
    'overdue',
    'pending',
    'paid',
    'pending',
    'draft',
    'paid',
    'overdue',
  ];

  return {
    granularity: ctx.granularity,
    kpis: {
      revenue: metric(ctx, revenue, 0.108, inflow),
      expenses: metric(ctx, cogs + opex + payroll, 0.064, outflow),
      netProfit: metric(ctx, net, 0.152),
      cash: metric(ctx, Math.round(revenue * 0.62 + 18_400_000), 0.047),
    },
    cashflow: points(ctx, { inflow, outflow }),
    bridge: [
      { key: 'revenue', value: revenue, total: true },
      { key: 'cogs', value: -cogs },
      { key: 'opex', value: -opex },
      { key: 'payroll', value: -payroll },
      { key: 'tax', value: -tax },
      { key: 'net', value: net, total: true },
    ],
    expenses: shares(
      ctx,
      [
        ['payroll', 41],
        ['rent', 14],
        ['marketing', 13],
        ['technology', 16],
        ['travel', 6],
        ['other', 10],
      ],
      { scale: (cogs + opex + payroll) / 100, spread: 0.12 },
    ),
    budget: (['sales', 'marketing', 'operations', 'technology', 'people'] as const).map(
      (key, i) => {
        const budget = Math.round(revenue * (0.09 - i * 0.008));
        return { key, budget, actual: Math.round(budget * s.between(0.7, 1.12)) };
      },
    ),
    aging: shares(
      ctx,
      [
        ['current', 58],
        ['d30', 21],
        ['d60', 10],
        ['d90', 6],
        ['d90plus', 5],
      ],
      { keepOrder: true, scale: revenue / 600, spread: 0.15 },
    ),
    ratios: {
      current: round(s.between(1.4, 2.3), 2),
      quick: round(s.between(0.9, 1.6), 2),
      grossMargin: round((revenue - cogs) / revenue, 3),
      dso: Math.round(s.between(32, 58)),
    },
    invoices: statuses.map((status, i) => ({
      id: `INV-${(20_480 + i * 11).toString()}`,
      customer: COMPANIES[(i * 3 + 1) % COMPANIES.length]!,
      amount: Math.round(s.between(18_000, 940_000) / 100) * 100,
      dueDate: daysFrom(now, dueInDays(status, s)),
      status,
    })),
  };
}
