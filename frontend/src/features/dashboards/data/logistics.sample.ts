import type { DashboardRange, LogisticsDashboard, ShipmentStep, VehicleStatus } from '../types';
import {
  CITIES,
  PEOPLE,
  metric,
  minutesFrom,
  points,
  round,
  sampleContext,
  series,
  shares,
} from './sample-kit';

const STEPS: ShipmentStep[] = ['ordered', 'packed', 'dispatched', 'inTransit', 'delivered'];

export function logisticsSample(range: DashboardRange, now: Date): LogisticsDashboard {
  const ctx = sampleContext('logistics', range, now);
  const { s } = ctx;
  const shipped = series(ctx, 1_280, { growth: 0.18, weekendDip: 0.4 });
  const delivered = shipped.map((v) => Math.round(v * s.between(0.9, 0.99)));
  const onRoute = s.int(38, 64);
  const currentStep = s.int(2, 3);
  const statuses: VehicleStatus[] = ['onTime', 'onTime', 'delayed', 'onTime', 'issue', 'onTime'];

  return {
    granularity: ctx.granularity,
    kpis: {
      onRoute: metric(ctx, onRoute, 0.18),
      withErrors: metric(ctx, s.int(3, 9), -0.083),
      deviated: metric(ctx, s.int(6, 14), 0.071),
      late: metric(ctx, s.int(8, 19), -0.104),
    },
    fleet: [
      { key: 'onTheWay', vehicles: onRoute, hours: round(s.between(28, 40), 1) },
      { key: 'unloading', vehicles: s.int(8, 16), hours: round(s.between(4, 9), 1) },
      { key: 'loading', vehicles: s.int(6, 12), hours: round(s.between(3, 7), 1) },
      { key: 'waiting', vehicles: s.int(4, 10), hours: round(s.between(6, 14), 1) },
    ],
    shipments: points(ctx, { shipped, delivered }),
    performance: [
      { key: 'inTransit', value: Math.round(shipped.at(-1)! * 1.6), change: 0.25 * s.noise(0.4) },
      {
        key: 'outForDelivery',
        value: Math.round(shipped.at(-1)! * 0.7),
        change: 0.12 * s.noise(0.4),
      },
      { key: 'delivered', value: delivered.at(-1)!, change: -0.035 * s.noise(0.4) },
      { key: 'successRate', value: round(s.between(0.94, 0.985), 3), change: 0.023 * s.noise(0.4) },
      {
        key: 'avgDeliveryHours',
        value: round(s.between(18, 30), 1),
        change: -0.051 * s.noise(0.4),
      },
      { key: 'rating', value: round(s.between(4.3, 4.8), 1), change: 0.01 * s.noise(0.4) },
    ],
    exceptions: shares(
      ctx,
      [
        ['address', 34],
        ['weather', 18],
        ['holiday', 13],
        ['damaged', 15],
        ['customs', 12],
        ['other', 8],
      ],
      { scale: ctx.days / 3 },
    ),
    onTime: round(s.between(0.86, 0.95), 3),
    tracked: {
      id: `SHP-${s.int(70_000, 79_999)}`,
      from: 'Addis Ababa',
      to: 'Hawassa',
      current: STEPS[currentStep]!,
      steps: STEPS.map((step, i) => ({
        step,
        at:
          i <= currentStep
            ? minutesFrom(now, -(currentStep - i + 1) * 60 * 5 - s.int(0, 90))
            : null,
      })),
    },
    vehicles: statuses.map((status, i) => {
      const from = CITIES[i % CITIES.length]!;
      const to = CITIES[(i + 3) % CITIES.length]!;
      return {
        id: `ET-3-${(41_200 + i * 317).toString()}`,
        driver: PEOPLE[(i * 2 + 1) % PEOPLE.length]!,
        from,
        to,
        status,
        progress: round(s.between(0.12, 0.92), 2),
        eta: minutesFrom(now, s.int(40, 600) + (status === 'delayed' ? 120 : 0)),
      };
    }),
  };
}
