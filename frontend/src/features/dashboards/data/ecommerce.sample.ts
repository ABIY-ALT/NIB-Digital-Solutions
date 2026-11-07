import type { DashboardRange, EcommerceDashboard, OrderStatus, PaymentMethod } from '../types';
import {
  PEOPLE,
  funnel,
  metric,
  minutesFrom,
  points,
  round,
  sampleContext,
  series,
  shares,
  sum,
} from './sample-kit';

const PRODUCTS = [
  ['Wireless earbuds', 'Electronics'],
  ['Running shoes', 'Sports'],
  ['Smart watch', 'Electronics'],
  ['Coffee maker', 'Home'],
  ['Leather backpack', 'Fashion'],
  ['Skin-care set', 'Beauty'],
  ['Desk lamp', 'Home'],
] as const;

export function ecommerceSample(range: DashboardRange, now: Date): EcommerceDashboard {
  const ctx = sampleContext('ecommerce', range, now);
  const { s } = ctx;
  const revenueSeries = series(ctx, 96_000, { growth: 0.22, weekendDip: -0.15 });
  const expenses = revenueSeries.map((v) => Math.round(v * s.between(0.55, 0.72)));
  const revenue = sum(revenueSeries);
  const aov = Math.round(s.between(1_850, 2_400));
  const orders = Math.round(revenue / aov);

  const statuses: OrderStatus[] = [
    'processing',
    'shipped',
    'delivered',
    'pending',
    'delivered',
    'cancelled',
    'shipped',
  ];
  const payments: PaymentMethod[] = [
    'card',
    'wallet',
    'transfer',
    'wallet',
    'cash',
    'card',
    'wallet',
  ];
  const topProducts = PRODUCTS.slice(0, 6)
    .map(([name, category], i) => {
      const units = Math.round((orders / 9) * (1 - i * 0.11) * s.noise(0.2));
      return {
        id: `P-${100 + i}`,
        name,
        category,
        units,
        revenue: Math.round(units * s.between(900, 4_800)),
        change: (s.next() - 0.35) * 0.4,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    granularity: ctx.granularity,
    highlight: {
      sales: Math.round(revenue * 0.18),
      target: Math.round(revenue * 0.16),
      product: topProducts[0]!.name,
    },
    kpis: {
      revenue: metric(ctx, revenue, 0.142, revenueSeries),
      orders: metric(ctx, orders, 0.093),
      aov: metric(ctx, aov, 0.038),
      refundRate: metric(ctx, round(s.between(0.012, 0.028), 4), -0.06),
    },
    totals: {
      orders: metric(ctx, orders, 0.093),
      customers: metric(ctx, Math.round(orders * 0.74), 0.071),
      units: metric(ctx, Math.round(orders * 1.9), 0.105),
      revenue: metric(ctx, revenue, 0.142),
    },
    revenue: points(ctx, { revenue: revenueSeries, expenses }),
    statuses: shares(
      ctx,
      [
        ['delivered', 62],
        ['shipped', 14],
        ['processing', 9],
        ['pending', 6],
        ['returned', 5],
        ['cancelled', 4],
      ],
      { scale: orders / 100 },
    ),
    categories: shares(
      ctx,
      [
        ['electronics', 31],
        ['fashion', 24],
        ['home', 17],
        ['beauty', 12],
        ['sports', 10],
        ['books', 6],
      ],
      { spread: 0.15 },
    ),
    topProducts,
    orders: statuses.map((status, i) => ({
      id: `#${(48_210 + i * 13).toString()}`,
      customer: PEOPLE[(i * 5 + 3) % PEOPLE.length]!,
      items: s.int(1, 5),
      total: Math.round(s.between(380, 9_800)),
      status,
      payment: payments[i]!,
      placedAt: minutesFrom(now, -(8 + i * 37 + s.int(0, 20))),
    })),
    inventory: PRODUCTS.map(([name], i) => ({
      sku: `SKU-${(3100 + i * 17).toString()}`,
      name,
      stock: s.int(i < 3 ? 4 : 30, i < 3 ? 40 : 180),
      capacity: 200,
    }))
      .sort((a, b) => a.stock / a.capacity - b.stock / b.capacity)
      .slice(0, 5),
    funnel: funnel(
      ctx,
      ['visits', 'productViews', 'cart', 'checkout', 'purchase'],
      Math.round(orders / 0.028),
      [0.52, 0.21, 0.56, 0.62],
    ),
  };
}
