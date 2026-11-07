import { describe, expect, it } from 'vitest';
import { createSampler, mulberry32, seedFrom } from '@/shared/lib/seeded-random';
import { layoutMiniBars } from '../charts/mini-bars';
import { deltaDirection, relativeChange } from './delta';
import { clampRatio } from './progress-bar';

describe('delta helpers', () => {
  it('classifies direction with a flat band', () => {
    expect(deltaDirection(0.12)).toBe('up');
    expect(deltaDirection(-0.01)).toBe('down');
    expect(deltaDirection(0.0001)).toBe('flat');
    expect(deltaDirection(undefined)).toBe('flat');
    expect(deltaDirection(Number.NaN)).toBe('flat');
  });

  it('computes relative change safely', () => {
    expect(relativeChange(120, 100)).toBeCloseTo(0.2);
    expect(relativeChange(80, 100)).toBeCloseTo(-0.2);
    expect(relativeChange(5, 0)).toBe(0);
    expect(relativeChange(-50, -100)).toBeCloseTo(0.5);
  });
});

describe('progress and mini bars', () => {
  it('clamps ratios', () => {
    expect(clampRatio(1.4)).toBe(1);
    expect(clampRatio(-1)).toBe(0);
    expect(clampRatio(Number.NaN)).toBe(0);
    expect(clampRatio(0.25)).toBe(0.25);
  });

  it('lays out equal-width bars scaled to the maximum', () => {
    const bars = layoutMiniBars([1, 2, 4], 100, 40, 5);
    expect(bars).toHaveLength(3);
    expect(bars[0]!.width).toBeCloseTo(30);
    expect(bars[2]!.x).toBeCloseTo(70);
    expect(bars[2]!.height).toBe(40);
    expect(bars[1]!.height).toBe(20);
    expect(bars[0]!.y + bars[0]!.height).toBe(40);
    expect(layoutMiniBars([], 100, 40)).toEqual([]);
    // Zero and negative values still show a sliver, never a negative height.
    expect(layoutMiniBars([0, -3], 20, 10).every((b) => b.height >= 2)).toBe(true);
  });
});

describe('seeded random', () => {
  it('is reproducible and seeds differ by text', () => {
    expect(mulberry32(7)()).toBe(mulberry32(7)());
    expect(seedFrom('crm', '30d')).toBe(seedFrom('crm', '30d'));
    expect(seedFrom('crm', '30d')).not.toBe(seedFrom('crm', '7d'));
    const a = createSampler(1);
    const b = createSampler(1);
    expect([a.int(1, 6), a.pick(['x', 'y', 'z']), a.walk(100, 3, 0.1)]).toEqual([
      b.int(1, 6),
      b.pick(['x', 'y', 'z']),
      b.walk(100, 3, 0.1),
    ]);
  });

  it('keeps samples inside their bounds', () => {
    const s = createSampler(42);
    for (let i = 0; i < 500; i++) {
      const n = s.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      const f = s.noise(0.2);
      expect(f).toBeGreaterThanOrEqual(0.9);
      expect(f).toBeLessThan(1.1);
    }
  });
});
