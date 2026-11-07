import { describe, expect, it } from 'vitest';
import { niceTicks } from './chart-utils';
import { monotonePath } from './trend-chart';

describe('niceTicks', () => {
  it('rounds the axis to 1-2-2.5-5 steps', () => {
    expect(niceTicks(97)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(1_840_000)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(0.37)).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
  });
});

describe('monotonePath', () => {
  it('draws straight segments for 2 points and cubic curves otherwise', () => {
    expect(
      monotonePath([
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M0,10L10,0');
    const d = monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 30, y: 0 },
    ]);
    expect(d.startsWith('M0,10C')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(3);
  });

  it('never overshoots a flat segment (monotone)', () => {
    const d = monotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 50 },
      { x: 20, y: 50 },
      { x: 30, y: 100 },
    ]);
    // Control points of the flat middle segment stay at y = 50.
    const middle = d.split('C')[2]!;
    expect(
      middle
        .split(' ')
        .slice(0, 2)
        .map((p) => Number(p.split(',')[1])),
    ).toEqual([50, 50]);
  });
});
