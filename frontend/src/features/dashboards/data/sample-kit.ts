import { createSampler, seedFrom, type Sampler } from '@/shared/lib/seeded-random';
import { granularityOf, isoDate, rangeBuckets, rangeDays } from '../lib/range';
import type { DashboardId, DashboardRange, Granularity, Metric, Share, TimePoint } from '../types';

/**
 * Building blocks for the sample providers. Output is deterministic per
 * dashboard, range and calendar day: reloading shows the same numbers, a new
 * day or a different range shows new ones. Shapes match the real payloads, so
 * replacing a sample provider with a live one changes no view code.
 */
export interface SampleContext {
  range: DashboardRange;
  now: Date;
  granularity: Granularity;
  /** Bucket start dates (oldest first). */
  buckets: string[];
  /** Calendar days in the period. */
  days: number;
  s: Sampler;
}

export function sampleContext(id: DashboardId, range: DashboardRange, now: Date): SampleContext {
  return {
    range,
    now,
    granularity: granularityOf(range),
    buckets: rangeBuckets(range, now),
    days: rangeDays(range),
    s: createSampler(seedFrom(id, range, isoDate(now))),
  };
}

const DAYS_PER_BUCKET: Record<Granularity, number> = { day: 1, week: 7, month: 30.4 };

/**
 * One value per bucket around `perDay` (scaled to the bucket size), with
 * growth over the period, a weekend dip for daily buckets and noise.
 */
export function series(
  ctx: SampleContext,
  perDay: number,
  { growth = 0.15, weekendDip = 0.35, volatility = 0.18, round = true } = {},
): number[] {
  const n = ctx.buckets.length;
  return ctx.buckets.map((date, i) => {
    const weekday = (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
    const dip = ctx.granularity === 'day' && weekday >= 5 ? 1 - weekendDip : 1;
    const trend = 1 + growth * (n > 1 ? i / (n - 1) - 0.5 : 0);
    const v = perDay * DAYS_PER_BUCKET[ctx.granularity] * dip * trend * ctx.s.noise(volatility);
    return round ? Math.round(v) : v;
  });
}

/** Zips series into time points: points(ctx, { won: [...], target: [...] }). */
export function points<K extends string>(
  ctx: SampleContext,
  values: Record<K, number[]>,
): TimePoint<K>[] {
  return ctx.buckets.map((date, i) => {
    const point = { date } as TimePoint<K>;
    for (const key of Object.keys(values) as K[]) {
      (point as Record<K, number>)[key] = values[key][i] ?? 0;
    }
    return point;
  });
}

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** A figure whose previous-period value differs by roughly `change` (−0.1 = 10 % lower now). */
export function metric(
  ctx: SampleContext,
  value: number,
  change: number,
  trend?: number[],
): Metric {
  const actual = change * ctx.s.noise(0.3);
  const previous = value / (1 + actual);
  return {
    value,
    previous: Number.isInteger(value) ? Math.round(previous) : previous,
    trend: trend ?? ctx.s.walk(value, 12, 0.12),
  };
}

/** Shares from base weights with noise, largest first unless `keepOrder`. */
export function shares<K extends string>(
  ctx: SampleContext,
  weights: ReadonlyArray<readonly [K, number]>,
  { spread = 0.2, keepOrder = false, scale = 1 } = {},
): Share<K>[] {
  const out = weights.map(([key, w]) => ({
    key,
    value: Math.round(w * scale * ctx.s.noise(spread)),
  }));
  return keepOrder ? out : out.sort((a, b) => b.value - a.value);
}

/** Monotonically decreasing stages (funnels): each stage keeps `keep` (±noise) of the previous one. */
export function funnel<K extends string>(
  ctx: SampleContext,
  keys: readonly K[],
  start: number,
  keep: readonly number[],
): Share<K>[] {
  let v = start;
  return keys.map((key, i) => {
    if (i > 0) v = Math.round(v * Math.min(0.98, (keep[i - 1] ?? 0.6) * ctx.s.noise(0.08)));
    return { key, value: v };
  });
}

/** Share of the peak in an hour of the day: business hours, their edges, night. */
function hourShape(hour: number): number {
  if (hour >= 8 && hour <= 18) return 1;
  return hour >= 6 && hour <= 22 ? 0.45 : 0.07;
}

/** weekday × hour intensity with a business-hours shape (Monday first). */
export function heatmap(ctx: SampleContext, peak: number, { weekend = 0.45 } = {}): number[][] {
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const business = hourShape(hour);
      const lunch = hour === 13 ? 0.8 : 1;
      return Math.round(peak * business * lunch * (day >= 5 ? weekend : 1) * ctx.s.noise(0.35));
    }),
  );
}

/** ISO timestamp `minutes` from now (negative = past). */
export function minutesFrom(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** ISO date `days` from today (negative = past). */
export function daysFrom(now: Date, days: number): string {
  return isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

export const round = (value: number, digits = 0): number => +value.toFixed(digits);

/** Sample people (international mix) and organisations. Data, not translations. */
export const PEOPLE = [
  'Mekdes Tadesse',
  'Abel Haile',
  'Sara Johnson',
  'Kidist Alemu',
  'Daniel Okafor',
  'Hana Girma',
  'Liam Chen',
  'Selam Bekele',
  'Amira Hassan',
  'Yonas Negash',
  'Priya Nair',
  'Tomas Silva',
  'Genet Mulu',
  'Noah Williams',
] as const;

export const COMPANIES = [
  'Abyssinia Foods',
  'Blue Nile Logistics',
  'Horizon Health',
  'Lucy Textiles',
  'Northwind Traders',
  'Sheba Pharma',
  'Summit Energy',
  'Tana Agro',
  'Vertex Systems',
  'Zenith Retail',
] as const;

export const CITIES = [
  'Addis Ababa',
  'Adama',
  'Hawassa',
  'Bahir Dar',
  'Dire Dawa',
  'Mekelle',
  'Gondar',
  'Jimma',
] as const;
