import { describe, expect, it } from 'vitest';
import { createDemoData, mulberry32, periodChange } from './mock-data';

describe('demo data', () => {
  it('is deterministic (server render == browser render)', () => {
    const day = new Date(2026, 8, 28);
    expect(createDemoData(day)).toEqual(createDemoData(day));
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });

  it('has realistic shapes', () => {
    const d = createDemoData(new Date(2026, 8, 28));
    expect(d.daily).toHaveLength(180);
    expect(d.daily.at(-1)!.date).toBe('2026-09-28');
    expect(d.heat).toHaveLength(7);
    expect(d.heat[0]).toHaveLength(24);
    // Business hours are busier than the night.
    expect(d.heat[0]![11]!).toBeGreaterThan(d.heat[0]![3]!);
    expect(d.branches.map((b) => b.value)).toEqual(
      [...d.branches.map((b) => b.value)].sort((a, b) => b - a),
    );
  });

  it('computes period-over-period change', () => {
    expect(periodChange([1, 1, 2, 2], 2)).toBe(1);
    expect(periodChange([5], 2)).toBe(0);
  });
});
