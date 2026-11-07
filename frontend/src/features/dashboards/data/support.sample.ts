import type { DashboardRange, SupportDashboard, TicketPriority, TicketStatus } from '../types';
import {
  COMPANIES,
  PEOPLE,
  heatmap,
  metric,
  minutesFrom,
  points,
  round,
  sampleContext,
  series,
  shares,
  sum,
} from './sample-kit';

const SUBJECTS = [
  'Cannot reset my password',
  'Payment failed but amount was deducted',
  'Request for account statement',
  'App crashes on sign-in',
  'Update registered phone number',
  'Card blocked after travel',
  'Invoice shows the wrong address',
] as const;

export function supportSample(range: DashboardRange, now: Date): SupportDashboard {
  const ctx = sampleContext('support', range, now);
  const { s } = ctx;
  const created = series(ctx, 420, { growth: 0.1, weekendDip: 0.55 });
  const resolved = created.map((v) => Math.round(v * s.between(0.88, 1.04)));
  const priorities: TicketPriority[] = [
    'urgent',
    'high',
    'normal',
    'high',
    'low',
    'normal',
    'urgent',
  ];
  const statuses: TicketStatus[] = ['new', 'open', 'pending', 'open', 'solved', 'new', 'open'];

  return {
    granularity: ctx.granularity,
    kpis: {
      created: metric(ctx, sum(created), 0.067, created),
      resolved: metric(ctx, sum(resolved), 0.094, resolved),
      firstResponse: metric(ctx, Math.round(s.between(12, 48)), -0.12),
      csat: metric(ctx, round(s.between(0.86, 0.94), 3), 0.021),
    },
    volume: points(ctx, { created, resolved }),
    channels: shares(
      ctx,
      [
        ['chat', 36],
        ['email', 28],
        ['phone', 19],
        ['portal', 12],
        ['social', 5],
      ],
      { scale: sum(created) / 100 },
    ),
    backlog: shares(
      ctx,
      [
        ['new', 64],
        ['open', 142],
        ['pending', 58],
        ['onHold', 21],
        ['escalated', 9],
      ],
      { keepOrder: true, spread: 0.3 },
    ),
    sla: { met: round(s.between(0.88, 0.97), 3), target: 0.95 },
    satisfaction: shares(
      ctx,
      [
        ['great', 58],
        ['good', 27],
        ['okay', 10],
        ['poor', 5],
      ],
      { keepOrder: true, spread: 0.15 },
    ),
    agents: PEOPLE.slice(2, 8)
      .map((name, i) => ({
        id: `AG-${i + 1}`,
        name,
        team: s.pick(['Tier 1', 'Tier 2', 'Billing'] as const),
        resolved: Math.round((sum(resolved) / 7) * s.noise(0.4)),
        csat: round(s.between(0.82, 0.98), 3),
        online: s.next() > 0.3,
      }))
      .sort((a, b) => b.resolved - a.resolved),
    heat: heatmap(ctx, 34, { weekend: 0.35 }),
    tickets: SUBJECTS.map((subject, i) => ({
      id: `T-${(91_400 + i * 23).toString()}`,
      subject,
      customer: i % 2 ? PEOPLE[(i * 3) % PEOPLE.length]! : COMPANIES[i % COMPANIES.length]!,
      priority: priorities[i]!,
      status: statuses[i]!,
      agent: statuses[i] === 'new' ? null : PEOPLE[(i + 2) % PEOPLE.length]!,
      createdAt: minutesFrom(now, -(6 + i * 41 + s.int(0, 30))),
    })),
  };
}
