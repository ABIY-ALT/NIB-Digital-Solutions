import { describe, expect, it } from 'vitest';
import { funnelConversions } from './charts/comparison';
import { semiPoint } from './charts/gauges';
import { radarPoint } from './charts/radar-chart';
import { layoutWaterfall } from './charts/waterfall-chart';
import { monthGrid } from './widgets/mini-calendar';
import { formatDuration } from './widgets/task-list';

describe('layoutWaterfall', () => {
  it('floats changes from the running level and resets on totals', () => {
    const bars = layoutWaterfall([
      { label: 'Open', value: 100, total: true },
      { label: 'In', value: 40 },
      { label: 'Out', value: -30 },
      { label: 'Close', value: 110, total: true },
    ]);
    expect(bars.map((b) => [b.kind, b.start, b.end])).toEqual([
      ['total', 0, 100],
      ['up', 100, 140],
      ['down', 140, 110],
      ['total', 0, 110],
    ]);
  });
});

describe('radarPoint', () => {
  it('starts at the top and goes clockwise', () => {
    const [x0, y0] = radarPoint(0, 4, 1, 200);
    const [x1, y1] = radarPoint(1, 4, 1, 200);
    expect([Math.round(x0), Math.round(y0)]).toEqual([100, 28]); // top (0.72 × radius)
    expect([Math.round(x1), Math.round(y1)]).toEqual([172, 100]); // right
    expect(radarPoint(2, 4, 0, 200)).toEqual([100, 100]); // centre at 0
  });
});

describe('funnelConversions', () => {
  it('computes step and overall conversion', () => {
    const r = funnelConversions([
      { label: 'a', value: 200 },
      { label: 'b', value: 100 },
      { label: 'c', value: 50 },
    ]);
    expect(r.step).toEqual([0.5, 0.5]);
    expect(r.overall).toBe(0.25);
    expect(funnelConversions([]).overall).toBe(0);
  });
});

describe('semiPoint', () => {
  it('maps 0 → left, 0.5 → top, 1 → right', () => {
    const round = ([x, y]: [number, number]) => [Math.round(x), Math.round(y)];
    expect(round(semiPoint(0, 10, 50, 50))).toEqual([40, 50]);
    expect(round(semiPoint(0.5, 10, 50, 50))).toEqual([50, 40]);
    expect(round(semiPoint(1, 10, 50, 50))).toEqual([60, 50]);
    expect(round(semiPoint(2, 10, 50, 50))).toEqual([60, 50]); // clamped
  });
});

describe('monthGrid', () => {
  it('returns 6 Monday-first weeks covering the month', () => {
    const grid = monthGrid(new Date(2026, 8, 15)); // September 2026 starts on a Tuesday
    expect(grid).toHaveLength(42);
    expect(grid[0]!.getDay()).toBe(1); // Monday
    expect(grid[0]!.getDate()).toBe(31); // 31 Aug
    expect(grid[1]!.getDate()).toBe(1); // 1 Sep
  });
});

describe('formatDuration', () => {
  it('formats minutes, hours and days (sign ignored)', () => {
    expect(formatDuration(35 * 60_000)).toBe('35m');
    expect(formatDuration(125 * 60_000)).toBe('2h 05m');
    expect(formatDuration(-(26 * 60 + 3) * 60_000)).toBe('1d 2h');
  });
});
