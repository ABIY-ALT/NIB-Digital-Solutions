/**
 * Deterministic mock data for the dashboard showcase widgets.
 *
 * Seeded (mulberry32), so the server render and the browser produce the SAME
 * numbers (no hydration mismatch) and screenshots are stable. Shapes mirror what
 * real banking endpoints would return, so swapping in a TanStack Query hook later
 * is a one-line change per widget. Amounts are ETB.
 */
import { mulberry32 } from '@/shared/lib/seeded-random';

export { mulberry32 };

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  inflow: number;
  outflow: number;
  transactions: number;
  failed: number;
}

export interface ChannelShare {
  key: 'mobile' | 'internet' | 'branch' | 'atm' | 'ussd' | 'agent';
  value: number;
}

export interface MonthlyChannels {
  month: string; // YYYY-MM
  mobile: number;
  internet: number;
  branch: number;
  atm: number;
}

export interface BranchPerformance {
  code: string;
  name: string;
  value: number;
  change: number;
}

export interface DashboardDemoData {
  daily: DailyPoint[];
  channels: ChannelShare[];
  monthly: MonthlyChannels[];
  branches: BranchPerformance[];
  /** heat[weekday 0=Mon][hour 0–23] = transactions */
  heat: number[][];
  limits: Array<{ key: 'rtgs' | 'transfer' | 'mobile' | 'atm'; used: number; limit: number }>;
  health: { uptime: number; slaWithin4h: number; failureRate: number };
  pipeline: { submitted: number; checker: number; approved: number; posted: number };
  events: Array<{
    id: string;
    kind: 'approved' | 'blocked' | 'limit' | 'payroll' | 'rejected' | 'login';
    minutesAgo: number;
    amount?: number;
    actor: string;
    ref: string;
  }>;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Share of the peak load in an hour of the day: business hours, their edges, night. */
function hourlyLoad(hour: number): number {
  if (hour >= 8 && hour <= 18) return 1;
  return hour >= 6 && hour <= 21 ? 0.45 : 0.08;
}

/** Generates the full demo dataset anchored on `today` (local calendar date). */
export function createDemoData(today = new Date(), seed = 2026): DashboardDemoData {
  const rand = mulberry32(seed);
  const noise = (spread: number) => 1 + (rand() - 0.5) * spread;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // 180 days: the 90-day view also needs the previous 90 days for its comparison.
  const daily: DailyPoint[] = Array.from({ length: 180 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - (179 - i));
    const weekday = (d.getDay() + 6) % 7; // 0 = Monday
    const weekend = weekday >= 5 ? 0.55 : 1;
    const monthEnd = d.getDate() >= 25 ? 1.25 : 1; // payroll peak
    const growth = 1 + i * 0.004;
    const transactions = Math.round(18_500 * weekend * monthEnd * growth * noise(0.22));
    const inflow = Math.round(transactions * 4_150 * noise(0.3));
    const outflow = Math.round(inflow * (0.78 + rand() * 0.24));
    return {
      date: iso(d),
      inflow,
      outflow,
      transactions,
      failed: Math.round(transactions * (0.008 + rand() * 0.01)),
    };
  });

  const channels: ChannelShare[] = [
    { key: 'mobile', value: 46_210 },
    { key: 'internet', value: 21_870 },
    { key: 'branch', value: 15_420 },
    { key: 'atm', value: 11_960 },
    { key: 'ussd', value: 6_130 },
    { key: 'agent', value: 3_480 },
  ].map((c) => ({ ...c, value: Math.round(c.value * noise(0.1)) })) as ChannelShare[];

  const monthly: MonthlyChannels[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() - (5 - i), 1);
    const g = 1 + i * 0.06;
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      mobile: Math.round(310_000 * g * noise(0.12)),
      internet: Math.round(150_000 * g * noise(0.12)),
      branch: Math.round(118_000 * (1 - i * 0.02) * noise(0.1)),
      atm: Math.round(84_000 * noise(0.1)),
    };
  });

  const branches: BranchPerformance[] = [
    ['ADD01', 'Addis Ababa Main'],
    ['ADD02', 'Bole'],
    ['HAW01', 'Hawassa'],
    ['BHD01', 'Bahir Dar'],
    ['MEK01', 'Mekelle'],
    ['ADA01', 'Adama'],
  ]
    .map(([code, name], i) => ({
      code: code!,
      name: name!,
      value: Math.round(92_000_000 * (1 - i * 0.13) * noise(0.12)),
      change: (rand() - 0.3) * 0.24,
    }))
    .sort((a, b) => b.value - a.value);

  const heat = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const business = hourlyLoad(hour);
      const lunchDip = hour === 13 ? 0.8 : 1;
      const weekend = day >= 5 ? 0.45 : 1;
      return Math.round(1_150 * business * lunchDip * weekend * noise(0.35));
    }),
  );

  return {
    daily,
    channels,
    monthly,
    branches,
    heat,
    limits: [
      { key: 'rtgs', used: 1_842_000_000, limit: 2_000_000_000 },
      { key: 'transfer', used: 612_500_000, limit: 900_000_000 },
      { key: 'mobile', used: 318_400_000, limit: 400_000_000 },
      { key: 'atm', used: 96_300_000, limit: 250_000_000 },
    ],
    health: { uptime: 99.96, slaWithin4h: 87.4, failureRate: 1.18 },
    pipeline: { submitted: 128, checker: 42, approved: 1_284, posted: 1_239 },
    events: [
      {
        id: 'e1',
        kind: 'approved',
        minutesAgo: 4,
        amount: 12_500_000,
        actor: 'mekdes.t',
        ref: 'RTGS-24091',
      },
      // Documentation address range (RFC 5737): demo data never names a real host.
      { id: 'e2', kind: 'blocked', minutesAgo: 17, actor: 'system', ref: '203.0.113.12' },
      {
        id: 'e3',
        kind: 'payroll',
        minutesAgo: 42,
        amount: 38_240_000,
        actor: 'abel.h',
        ref: 'PAY-0925',
      },
      {
        id: 'e4',
        kind: 'rejected',
        minutesAgo: 75,
        amount: 4_800_000,
        actor: 'kidist.a',
        ref: 'TRF-88213',
      },
      { id: 'e5', kind: 'limit', minutesAgo: 190, actor: 'admin', ref: 'Bole · ADD02' },
    ],
  };
}

/** Relative change between the last `n` points and the `n` before them. */
export function periodChange(values: number[], n: number): number {
  const recent = values.slice(-n).reduce((a, b) => a + b, 0);
  const previous = values.slice(-2 * n, -n).reduce((a, b) => a + b, 0);
  return previous ? (recent - previous) / previous : 0;
}

// ── Advanced widgets (treasury, operations, customers) ───────────────────────

export interface FxRate {
  code: string;
  buy: number;
  sell: number;
  /** Relative change vs yesterday. */
  change: number;
  trend: number[];
}

export interface AdvancedDemoData {
  fx: FxRate[];
  /** Cash position movement (ETB), opening → closing. */
  cash: Array<{
    key:
      'opening' | 'deposits' | 'transfersIn' | 'withdrawals' | 'transfersOut' | 'loans' | 'closing';
    value: number;
    total?: boolean;
  }>;
  liquidity: { ratio: number; minimum: number; comfort: number };
  targets: Array<{ code: string; name: string; actual: number; target: number }>;
  depositMix: Array<{
    key: 'savings' | 'current' | 'fixed' | 'interestFree' | 'diaspora';
    value: number;
  }>;
  tasks: Array<{
    id: string;
    kind: 'rtgs' | 'loan' | 'limit' | 'user' | 'payroll';
    ref: string;
    amount?: number;
    maker: string;
    priority: 'high' | 'medium' | 'low';
    dueInMinutes: number;
  }>;
  events: Array<{
    id: string;
    dayOffset: number;
    kind: 'payroll' | 'holiday' | 'board' | 'maturity' | 'audit' | 'release';
    time?: string;
  }>;
  funnel: Array<{ key: 'started' | 'kyc' | 'verified' | 'opened' | 'funded'; value: number }>;
  radar: {
    axes: Array<'deposits' | 'lending' | 'digital' | 'retention' | 'crossSell' | 'satisfaction'>;
    current: number[];
    previous: number[];
  };
}

export function createAdvancedDemoData(seed = 7): AdvancedDemoData {
  const rand = mulberry32(seed);
  const walk = (start: number, n: number, vol: number) => {
    let v = start;
    return Array.from({ length: n }, () => (v = v * (1 + (rand() - 0.48) * vol)));
  };
  const fx = (
    [
      ['USD', 155.42],
      ['EUR', 168.9],
      ['GBP', 197.35],
      ['AED', 42.31],
      ['SAR', 41.44],
      ['CNY', 21.63],
      ['KES', 1.2],
    ] as const
  ).map(([code, mid]) => {
    const trend = walk(mid * 0.985, 30, 0.012);
    const last = trend.at(-1)!;
    const prev = trend.at(-2)!;
    const spread = last * 0.012;
    return {
      code,
      buy: +(last - spread / 2).toFixed(4),
      sell: +(last + spread / 2).toFixed(4),
      change: (last - prev) / prev,
      trend,
    };
  });

  const opening = 4_820_000_000;
  const moves = {
    deposits: 1_240_000_000,
    transfersIn: 610_000_000,
    withdrawals: -980_000_000,
    transfersOut: -720_000_000,
    loans: -410_000_000,
  };
  const closing = opening + Object.values(moves).reduce((a, b) => a + b, 0);

  return {
    fx,
    cash: [
      { key: 'opening', value: opening, total: true },
      { key: 'deposits', value: moves.deposits },
      { key: 'transfersIn', value: moves.transfersIn },
      { key: 'withdrawals', value: moves.withdrawals },
      { key: 'transfersOut', value: moves.transfersOut },
      { key: 'loans', value: moves.loans },
      { key: 'closing', value: closing, total: true },
    ],
    liquidity: { ratio: 28.4, minimum: 15, comfort: 20 },
    targets: [
      { code: 'ADD01', name: 'Addis Ababa Main', actual: 1_182_000_000, target: 1_100_000_000 },
      { code: 'ADD02', name: 'Bole', actual: 846_000_000, target: 900_000_000 },
      { code: 'HAW01', name: 'Hawassa', actual: 512_000_000, target: 650_000_000 },
      { code: 'BHD01', name: 'Bahir Dar', actual: 468_000_000, target: 480_000_000 },
      { code: 'MEK01', name: 'Mekelle', actual: 301_000_000, target: 420_000_000 },
    ],
    depositMix: [
      { key: 'savings', value: 41 },
      { key: 'current', value: 24 },
      { key: 'fixed', value: 18 },
      { key: 'interestFree', value: 11 },
      { key: 'diaspora', value: 6 },
    ],
    tasks: [
      {
        id: 't1',
        kind: 'rtgs',
        ref: 'RTGS-24117',
        amount: 25_000_000,
        maker: 'mekdes.t',
        priority: 'high',
        dueInMinutes: -18,
      },
      {
        id: 't2',
        kind: 'loan',
        ref: 'LN-5521',
        amount: 7_500_000,
        maker: 'abel.h',
        priority: 'high',
        dueInMinutes: 42,
      },
      {
        id: 't3',
        kind: 'payroll',
        ref: 'PAY-1025',
        amount: 41_830_000,
        maker: 'kidist.a',
        priority: 'medium',
        dueInMinutes: 170,
      },
      {
        id: 't4',
        kind: 'limit',
        ref: 'Hawassa · HAW01',
        maker: 'genet.m',
        priority: 'medium',
        dueInMinutes: 300,
      },
      {
        id: 't5',
        kind: 'user',
        ref: 'yonas.negash',
        maker: 'admin',
        priority: 'low',
        dueInMinutes: 1_560,
      },
    ],
    events: [
      { id: 'c1', dayOffset: 0, kind: 'board', time: '10:00' },
      { id: 'c2', dayOffset: 0, kind: 'release', time: '18:30' },
      { id: 'c3', dayOffset: 2, kind: 'maturity' },
      { id: 'c4', dayOffset: 5, kind: 'audit', time: '09:00' },
      { id: 'c5', dayOffset: 9, kind: 'holiday' },
      { id: 'c6', dayOffset: 12, kind: 'payroll' },
      { id: 'c7', dayOffset: -3, kind: 'maturity' },
      { id: 'c8', dayOffset: 19, kind: 'board', time: '14:00' },
    ],
    funnel: [
      { key: 'started', value: 12_480 },
      { key: 'kyc', value: 8_930 },
      { key: 'verified', value: 7_210 },
      { key: 'opened', value: 6_540 },
      { key: 'funded', value: 4_870 },
    ],
    radar: {
      axes: ['deposits', 'lending', 'digital', 'retention', 'crossSell', 'satisfaction'],
      current: [82, 64, 88, 76, 58, 79],
      previous: [74, 61, 71, 78, 49, 72],
    },
  };
}
