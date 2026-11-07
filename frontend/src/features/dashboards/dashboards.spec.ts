import { describe, expect, it } from 'vitest';
import { isFeatureEnabled } from '@/infrastructure/config/app-config.schema';
import { appConfig } from '@/infrastructure/config/app.config';
import { SAMPLES } from './data';
import en from './i18n/en.json';
import am from './i18n/am.json';
import { granularityOf, parseRange, rangeBuckets } from './lib/range';
import {
  availableDashboards,
  canOpenDashboard,
  DASHBOARDS,
  dashboardFlag,
  findDashboard,
  type DashboardDefinition,
} from './registry';
import { DASHBOARD_RANGES, type DashboardId } from './types';

const DAY = new Date(2026, 9, 14, 10, 30);
const admin = { permissions: ['*'], roles: ['SUPER_ADMIN'] };

describe('dashboard registry', () => {
  it('has one unique entry per payload type, each with a sample provider', () => {
    const ids = DASHBOARDS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it('offers valid ranges and a default among them', () => {
    for (const d of DASHBOARDS) {
      expect(d.ranges.length).toBeGreaterThan(0);
      expect(d.ranges).toContain(d.defaultRange);
      for (const r of d.ranges) expect(DASHBOARD_RANGES).toContain(r);
      expect(d.flag).toBe(dashboardFlag(d.id));
    }
  });

  it('is wired into the product config: a flag and a navigation item per dashboard', () => {
    const items = appConfig.navigation.flatMap((s) => s.items);
    for (const d of DASHBOARDS) {
      expect(appConfig.features[d.flag], d.flag).toBeTypeOf('boolean');
      const item = items.find((i) => i.href === `/dashboards/${d.id}`);
      expect(item?.feature, d.id).toBe(d.flag);
      expect(item?.icon, d.id).toBe(d.icon);
    }
  });

  it('has titles and descriptions in every language', () => {
    for (const messages of [en, am]) {
      const catalogue = messages.dashboards.catalogue as Record<
        string,
        { title: string; description: string }
      >;
      for (const d of DASHBOARDS) {
        expect(catalogue[d.id]?.title, d.id).toBeTruthy();
        expect(catalogue[d.id]?.description, d.id).toBeTruthy();
      }
    }
  });

  it('hides dashboards that are switched off or not permitted', () => {
    const restricted: DashboardDefinition = {
      ...findDashboard('finance')!,
      requires: { permission: 'finance:read' },
    };
    const on = { isFeatureEnabled: () => true };
    expect(canOpenDashboard(restricted, { ...on, user: admin })).toBe(true);
    expect(
      canOpenDashboard(restricted, { ...on, user: { permissions: ['users:read'], roles: [] } }),
    ).toBe(false);
    expect(canOpenDashboard(restricted, { ...on, user: null })).toBe(false);
    expect(
      canOpenDashboard(findDashboard('crm')!, { isFeatureEnabled: () => false, user: admin }),
    ).toBe(false);
    expect(
      availableDashboards({ isFeatureEnabled: (f) => f === 'dashboards.hr', user: admin }).map(
        (d) => d.id,
      ),
    ).toEqual(['hr']);
    // The product's own configuration decides (NIB Digital Solutions switches every sample off).
    const switchedOn = Object.entries(appConfig.features)
      .filter(([flag, on]) => flag.startsWith('dashboards.') && on)
      .map(([flag]) => flag.slice('dashboards.'.length))
      .sort();
    expect(
      availableDashboards({ isFeatureEnabled: (f) => isFeatureEnabled(appConfig, f), user: admin })
        .map((d) => d.id)
        .sort(),
    ).toEqual(switchedOn);
  });

  it('finds only known ids', () => {
    expect(findDashboard('crm')?.id).toBe('crm');
    expect(findDashboard('../users')).toBeUndefined();
    expect(findDashboard('')).toBeUndefined();
  });
});

describe('dashboard ranges', () => {
  const options = { ranges: ['7d', '30d', '90d'] as const, defaultRange: '30d' as const };

  it('accepts only offered ranges and falls back to the default', () => {
    expect(parseRange('7d', options)).toBe('7d');
    expect(parseRange(['90d', '7d'], options)).toBe('90d');
    expect(parseRange('12m', options)).toBe('30d'); // valid range, not offered here
    expect(parseRange('1y', options)).toBe('30d');
    expect(parseRange(undefined, options)).toBe('30d');
  });

  it('buckets each period at the right granularity, ending today', () => {
    expect(rangeBuckets('7d', DAY)).toHaveLength(7);
    expect(rangeBuckets('7d', DAY).at(-1)).toBe('2026-10-14');
    expect(rangeBuckets('30d', DAY)[0]).toBe('2026-09-15');
    const weeks = rangeBuckets('90d', DAY);
    expect(weeks).toHaveLength(13);
    expect(weeks.at(-1)).toBe('2026-10-12'); // Monday of the current week
    expect(new Set(weeks.map((d) => new Date(`${d}T00:00:00`).getDay()))).toEqual(new Set([1]));
    const months = rangeBuckets('12m', DAY);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-11-01');
    expect(months.at(-1)).toBe('2026-10-01');
    expect(granularityOf('7d')).toBe('day');
    expect(granularityOf('90d')).toBe('week');
    expect(granularityOf('12m')).toBe('month');
  });
});

describe('sample providers', () => {
  const ids = Object.keys(SAMPLES) as DashboardId[];

  // Timestamps are relative to "now" by design; the figures must not move within a day.
  const figures = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value), (_, v: unknown) =>
      typeof v === 'string' && /T\d{2}:\d{2}/.test(v) ? '<time>' : v,
    );

  it.each(ids)('%s is deterministic per day and range', (id) => {
    const sample = SAMPLES[id] as (range: '30d' | '12m', now: Date) => unknown;
    expect(sample('30d', DAY)).toEqual(sample('30d', new Date(DAY)));
    expect(figures(sample('30d', DAY))).toEqual(
      figures(sample('30d', new Date(2026, 9, 14, 23, 59))),
    );
    expect(sample('30d', DAY)).not.toEqual(sample('12m', DAY));
  });

  it.each(ids)('%s has one time-series point per bucket for every range', (id) => {
    for (const range of DASHBOARD_RANGES) {
      const data = SAMPLES[id](range, DAY) as unknown as Record<string, unknown>;
      expect(data.granularity).toBe(granularityOf(range));
      const series = Object.values(data).filter(
        (v): v is Array<{ date: string }> =>
          Array.isArray(v) && typeof (v[0] as { date?: unknown } | undefined)?.date === 'string',
      );
      expect(series.length, `${id} ${range}`).toBeGreaterThan(0);
      for (const s of series) {
        expect(s.map((p) => p.date)).toEqual(rangeBuckets(range, DAY));
      }
    }
  });

  it('produces plausible figures', () => {
    const crm = SAMPLES.crm('30d', DAY);
    expect(crm.funnel.map((s) => s.count)).toEqual(
      [...crm.funnel.map((s) => s.count)].sort((a, b) => b - a),
    );
    expect(crm.kpis.conversion.value).toBeGreaterThan(0);
    expect(crm.kpis.conversion.value).toBeLessThan(1);

    const finance = SAMPLES.finance('12m', DAY);
    const bridge = finance.bridge.filter((b) => !b.total).reduce((a, b) => a + b.value, 0);
    expect(finance.bridge[0]!.value + bridge).toBe(finance.bridge.at(-1)!.value);

    const logistics = SAMPLES.logistics('7d', DAY);
    expect(logistics.tracked.steps.some((s) => s.step === logistics.tracked.current)).toBe(true);
    for (const v of logistics.vehicles) expect(v.progress).toBeGreaterThanOrEqual(0);

    const analytics = SAMPLES.analytics('90d', DAY);
    expect(analytics.heat).toHaveLength(7);
    expect(analytics.heat[0]).toHaveLength(24);
  });
});
