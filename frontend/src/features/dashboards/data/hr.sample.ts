import type { DashboardRange, Department, HrDashboard } from '../types';
import {
  PEOPLE,
  daysFrom,
  funnel,
  metric,
  points,
  round,
  sampleContext,
  series,
  shares,
  sum,
} from './sample-kit';

const ROLES: ReadonlyArray<readonly [string, Department]> = [
  ['Senior backend engineer', 'engineering'],
  ['Relationship manager', 'sales'],
  ['Operations analyst', 'operations'],
  ['Financial controller', 'finance'],
  ['Customer support lead', 'support'],
  ['Talent acquisition partner', 'people'],
];

export function hrSample(range: DashboardRange, now: Date): HrDashboard {
  const ctx = sampleContext('hr', range, now);
  const { s } = ctx;
  const hires = series(ctx, 1.1, { growth: 0.2, weekendDip: 0.9, volatility: 0.6 });
  const exits = series(ctx, 0.7, { growth: -0.1, weekendDip: 0.9, volatility: 0.6 });
  const headcount = s.int(1_180, 1_420);
  const openRoles = s.int(18, 34);

  return {
    granularity: ctx.granularity,
    kpis: {
      headcount: metric(ctx, headcount, 0.032),
      hires: metric(ctx, sum(hires), 0.14, hires),
      attrition: metric(ctx, round(s.between(0.07, 0.12), 4), -0.06),
      openRoles: metric(ctx, openRoles, 0.11),
    },
    movement: points(ctx, { hires, exits }),
    departments: (
      [
        ['engineering', 0.27],
        ['operations', 0.22],
        ['sales', 0.19],
        ['support', 0.16],
        ['finance', 0.09],
        ['people', 0.07],
      ] as const
    ).map(([key, w]) => ({
      key,
      employees: Math.round(headcount * w * s.noise(0.08)),
      change: (s.next() - 0.35) * 0.12,
    })),
    contracts: shares(
      ctx,
      [
        ['permanent', 78],
        ['contract', 13],
        ['temporary', 5],
        ['intern', 4],
      ],
      { scale: headcount / 100, spread: 0.1 },
    ),
    tenure: shares(
      ctx,
      [
        ['lt1', 18],
        ['y1to3', 31],
        ['y3to5', 22],
        ['y5to10', 19],
        ['gt10', 10],
      ],
      { keepOrder: true, scale: headcount / 100, spread: 0.12 },
    ),
    recruitment: funnel(
      ctx,
      ['applied', 'screened', 'interviewed', 'offered', 'hired'],
      Math.round(openRoles * s.between(38, 60)),
      [0.34, 0.42, 0.3, 0.82],
    ),
    engagement: {
      axes: ['growth', 'recognition', 'wellbeing', 'management', 'teamwork', 'pay'],
      current: [72, 66, 78, 74, 86, 61].map((v) => Math.min(100, Math.round(v * s.noise(0.1)))),
      previous: [68, 63, 74, 75, 82, 58],
    },
    roles: ROLES.map(([title, department], i) => ({
      id: `R-${300 + i}`,
      title,
      department,
      applicants: s.int(8, 140),
      postedAt: daysFrom(now, -s.int(2, 45)),
    })).sort((a, b) => b.applicants - a.applicants),
    calendar: (
      ['onboarding', 'birthday', 'leave', 'anniversary', 'onboarding', 'birthday'] as const
    ).map((kind, i) => ({
      id: `E-${i + 1}`,
      name: PEOPLE[(i * 5 + 2) % PEOPLE.length]!,
      kind,
      at: daysFrom(now, i === 0 ? 0 : s.int(i, i * 3 + 2)),
    })),
  };
}
