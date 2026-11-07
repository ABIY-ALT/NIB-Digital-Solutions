import type { CrmDashboard, DashboardRange, DealStage } from '../types';
import {
  COMPANIES,
  PEOPLE,
  daysFrom,
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

export function crmSample(range: DashboardRange, now: Date): CrmDashboard {
  const ctx = sampleContext('crm', range, now);
  const { s } = ctx;
  const won = series(ctx, 182_000, { growth: 0.25 });
  const target = won.map((v) => Math.round((v / 1.08) * s.noise(0.06)));
  const revenue = sum(won);
  const dealsWon = Math.round(revenue / s.between(95_000, 130_000));
  const leads = Math.round(dealsWon * s.between(6, 9));

  const stages: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won'];
  const counts = funnel(ctx, stages, leads, [0.58, 0.52, 0.61, 0.55]);
  const reps = PEOPLE.slice(0, 6)
    .map((name, i) => {
      const repRevenue = Math.round((revenue / 4.2) * (1 - i * 0.12) * s.noise(0.2));
      return {
        id: `rep-${i + 1}`,
        name,
        team: s.pick(['Enterprise', 'Mid-market', 'SMB'] as const),
        deals: Math.max(1, Math.round(dealsWon / 5.5) - i + s.int(-1, 2)),
        revenue: repRevenue,
        quota: Math.round(repRevenue * s.between(0.82, 1.25)),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const top = reps[0]!;

  const dealStages: DealStage[] = [
    'proposal',
    'negotiation',
    'qualified',
    'won',
    'negotiation',
    'lead',
    'proposal',
  ];
  return {
    granularity: ctx.granularity,
    highlight: { name: top.name, revenue: top.revenue, target: top.quota, dealsWon: top.deals },
    totals: {
      revenue: metric(ctx, revenue, 0.124, won),
      customers: metric(ctx, Math.round(dealsWon * 0.7 + 1_240), 0.046),
      dealsWon: metric(ctx, dealsWon, 0.081),
      pipeline: metric(ctx, sum(counts.slice(1, 4).map((c) => c.value)) * 142_000, 0.063),
    },
    kpis: {
      newLeads: metric(ctx, leads, 0.094),
      conversion: metric(ctx, round(dealsWon / leads, 4), 0.031),
      avgDeal: metric(ctx, Math.round(revenue / Math.max(1, dealsWon)), -0.022),
      churn: metric(ctx, round(s.between(0.018, 0.032), 4), -0.08),
    },
    revenue: points(ctx, { won, target }),
    funnel: counts.map((c, i) => ({
      stage: c.key,
      count: c.value,
      value: Math.round(c.value * (60_000 + i * 22_000) * s.noise(0.1)),
    })),
    sources: shares(
      ctx,
      [
        ['referral', 34],
        ['website', 27],
        ['events', 14],
        ['outbound', 12],
        ['partners', 9],
        ['social', 6],
      ],
      { scale: ctx.days * 0.9 },
    ),
    reps,
    regions: [
      ['ADD', 'Addis Ababa'],
      ['ORO', 'Oromia'],
      ['AMH', 'Amhara'],
      ['SID', 'Sidama'],
      ['DIR', 'Dire Dawa'],
    ]
      .map(([code, name], i) => ({
        code: code!,
        name: name!,
        revenue: Math.round(revenue * (0.38 - i * 0.07) * s.noise(0.15)),
        change: (s.next() - 0.3) * 0.3,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    performance: {
      axes: ['prospecting', 'meetings', 'proposals', 'closing', 'retention', 'upsell'],
      team: [78, 84, 69, 72, 88, 57].map((v) => Math.min(100, Math.round(v * s.noise(0.12)))),
      target: [80, 80, 75, 75, 85, 65],
    },
    deals: COMPANIES.slice(0, 7).map((company, i) => ({
      id: `D-${2410 + i * 7}`,
      company,
      owner: reps[i % reps.length]!.name,
      stage: dealStages[i]!,
      amount: Math.round(s.between(40_000, 680_000) / 1_000) * 1_000,
      probability: round(dealStages[i] === 'won' ? 1 : s.between(0.2, 0.85), 2),
      closeDate: daysFrom(now, dealStages[i] === 'won' ? -s.int(1, 6) : s.int(3, 40)),
    })),
    agenda: (['meeting', 'call', 'demo', 'contract', 'email'] as const).map((kind, i) => ({
      id: `A-${i + 1}`,
      kind,
      company: COMPANIES[(i * 3 + 2) % COMPANIES.length]!,
      owner: reps[(i + 1) % reps.length]!.name,
      at: minutesFrom(now, 35 + i * 140 + s.int(0, 40)),
    })),
  };
}
