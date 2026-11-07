import type { AnalyticsDashboard, DashboardRange } from '../types';
import {
  funnel,
  heatmap,
  metric,
  points,
  round,
  sampleContext,
  series,
  shares,
  sum,
} from './sample-kit';

export function analyticsSample(range: DashboardRange, now: Date): AnalyticsDashboard {
  const ctx = sampleContext('analytics', range, now);
  const { s } = ctx;
  const visitors = series(ctx, 8_400, { growth: 0.2, weekendDip: 0.3 });
  const pageViews = visitors.map((v) => Math.round(v * s.between(2.6, 3.4)));
  const totalVisitors = sum(visitors);
  const sessions = Math.round(totalVisitors * 1.36);

  return {
    granularity: ctx.granularity,
    kpis: {
      visitors: metric(ctx, totalVisitors, 0.112, visitors),
      sessions: metric(ctx, sessions, 0.087),
      bounceRate: metric(ctx, round(s.between(0.34, 0.46), 4), -0.041),
      avgDuration: metric(ctx, Math.round(s.between(150, 260)), 0.058),
    },
    traffic: points(ctx, { visitors, pageViews }),
    sources: shares(
      ctx,
      [
        ['organic', 41],
        ['direct', 23],
        ['social', 14],
        ['referral', 11],
        ['email', 7],
        ['paid', 4],
      ],
      { scale: totalVisitors / 100 },
    ),
    devices: shares(
      ctx,
      [
        ['mobile', 61],
        ['desktop', 33],
        ['tablet', 6],
      ],
      { spread: 0.1 },
    ),
    browsers: [
      ['Chrome', 58],
      ['Safari', 19],
      ['Edge', 9],
      ['Firefox', 6],
      ['Samsung Internet', 5],
      ['Opera', 3],
    ].map(([name, w]) => ({
      name: name as string,
      value: Math.round((totalVisitors * (w as number)) / 100),
      change: (s.next() - 0.45) * 0.2,
    })),
    countries: [
      ['ET', 46],
      ['US', 14],
      ['KE', 9],
      ['GB', 7],
      ['DE', 6],
      ['AE', 5],
      ['IN', 4],
    ]
      .map(([code, w]) => ({
        code: code as string,
        value: Math.round(((totalVisitors * (w as number)) / 100) * s.noise(0.15)),
        change: (s.next() - 0.35) * 0.3,
      }))
      .sort((a, b) => b.value - a.value),
    pages: [
      '/',
      '/pricing',
      '/products/mobile-app',
      '/blog/digital-onboarding',
      '/support/faq',
      '/careers',
      '/contact',
    ].map((path, i) => ({
      path,
      views: Math.round(sum(pageViews) * (0.24 - i * 0.03) * s.noise(0.15)),
      avgTime: Math.round(s.between(40, 240)),
      bounce: round(s.between(0.22, 0.62), 3),
    })),
    heat: heatmap(ctx, 940),
    goal: {
      completed: Math.round(totalVisitors * 0.031),
      target: Math.round(totalVisitors * 0.036),
    },
    campaign: funnel(
      ctx,
      ['sent', 'delivered', 'opened', 'clicked', 'converted'],
      Math.round(ctx.days * 1_650),
      [0.97, 0.42, 0.24, 0.18],
    ),
  };
}
