import { DASHBOARD_RANGES, type DashboardRange, type Granularity } from '../types';

/** Local calendar date as YYYY-MM-DD (no time-zone shift, unlike toISOString). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isDashboardRange(value: unknown): value is DashboardRange {
  return typeof value === 'string' && (DASHBOARD_RANGES as readonly string[]).includes(value);
}

/** A query-string value → one of the ranges a dashboard offers (else its default). */
export function parseRange(
  value: unknown,
  options: { ranges: readonly DashboardRange[]; defaultRange: DashboardRange },
): DashboardRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return isDashboardRange(raw) && options.ranges.includes(raw) ? raw : options.defaultRange;
}

const GRANULARITY: Record<DashboardRange, Granularity> = {
  '7d': 'day',
  '30d': 'day',
  '90d': 'week',
  '12m': 'month',
};

/** Calendar days a range covers (90 days are 13 whole weeks). */
const RANGE_DAYS: Record<DashboardRange, number> = { '7d': 7, '30d': 30, '90d': 91, '12m': 365 };

export function granularityOf(range: DashboardRange): Granularity {
  return GRANULARITY[range];
}

/** Calendar days a range covers (used to scale period totals). */
export function rangeDays(range: DashboardRange): number {
  return RANGE_DAYS[range];
}

/**
 * Start dates of the time-series buckets ending at `now`, oldest first:
 * 7d → 7 days, 30d → 30 days, 90d → 13 weeks (Mondays), 12m → 12 months (1st).
 */
export function rangeBuckets(range: DashboardRange, now: Date): string[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === '12m') {
    return Array.from({ length: 12 }, (_, i) =>
      isoDate(new Date(today.getFullYear(), today.getMonth() - (11 - i), 1)),
    );
  }
  if (range === '90d') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 13 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() - (12 - i) * 7);
      return isoDate(d);
    });
  }
  const days = range === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return isoDate(d);
  });
}
