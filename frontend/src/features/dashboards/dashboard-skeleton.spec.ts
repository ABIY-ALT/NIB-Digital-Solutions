import { describe, expect, it } from 'vitest';
import { DASHBOARD_SKELETONS } from './components/dashboard-skeleton';
import { DASHBOARDS } from './registry';

/** Columns each skeleton layout offers at its widest breakpoint. */
const COLUMNS = { kpis: 4, tiles: 4, three: 3, two: 2, one: 1 } as const;

describe('dashboard skeletons', () => {
  it('exist for every dashboard in the catalogue', () => {
    expect(Object.keys(DASHBOARD_SKELETONS).sort()).toEqual(DASHBOARDS.map((d) => d.id).sort());
  });

  it.each(Object.entries(DASHBOARD_SKELETONS))('%s rows fill their grid exactly', (_, rows) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // A wide cell spans two columns; only the three-column layout has room for one.
      const span = row.cells.reduce((sum, cell) => sum + (cell.wide ? 2 : 1), 0);
      if (row.cells.some((c) => c.wide)) expect(row.layout).toBe('three');
      expect(span).toBe(COLUMNS[row.layout]);
    }
  });

  it('opens with the header row each view opens with', () => {
    // Views with a hero card start with it; the others start with the KPI row.
    for (const [id, rows] of Object.entries(DASHBOARD_SKELETONS)) {
      const first = rows[0]!;
      const startsWithHero = first.cells[0]?.kind === 'hero';
      expect(startsWithHero || first.layout === 'kpis', id).toBe(true);
    }
  });
});
