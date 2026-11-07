// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, openMenu, renderApp } from '@/testing/render';
import { SAMPLES } from '../data';
import { DASHBOARDS, findDashboard } from '../registry';
import type { DashboardId, DashboardRange } from '../types';
import { DashboardPage } from './dashboard-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const NOW = new Date(2026, 9, 14, 10, 30);

/** The BFF's reply for a dashboard: its sample payload for the requested range. */
function dashboardRoute(id: DashboardId, source: 'sample' | 'live' = 'sample') {
  return ({ url }: { url: URL }) => {
    const range = (url.searchParams.get('range') ??
      findDashboard(id)!.defaultRange) as DashboardRange;
    return { id, range, source, generatedAt: NOW.toISOString(), data: SAMPLES[id](range, NOW) };
  };
}

const ALL_IDS = DASHBOARDS.map((d) => d.id);

describe('DashboardPage', () => {
  it.each(ALL_IDS)('renders the %s dashboard in each of its ranges', async (id) => {
    const definition = findDashboard(id)!;
    const api = mockApi({ [`GET /api/dashboards/${id}`]: dashboardRoute(id) });
    const { container } = renderApp(
      <DashboardPage id={id} initialRange={definition.defaultRange} available={ALL_IDS} />,
    );
    await waitFor(() =>
      expect(
        container.querySelector('[aria-busy]') ?? container.querySelector('svg, table'),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(container.querySelectorAll('svg').length).toBeGreaterThan(3));

    for (const range of definition.ranges.filter((r) => r !== definition.defaultRange)) {
      const option =
        screen.queryByRole('radio', { name: new RegExp(range, 'i') }) ??
        screen
          .getAllByRole('radio')
          .find(
            (r) =>
              r.getAttribute('value') === range || r.textContent?.toLowerCase().includes(range),
          );
      if (option) fireEvent.click(option);
      await waitFor(() => expect(api.calls.some((c) => c.query.get('range') === range)).toBe(true));
    }
    expect(window.location.search).toContain('range=');
  });

  it('switches to another dashboard and refreshes', async () => {
    const api = mockApi({ 'GET /api/dashboards/crm': dashboardRoute('crm', 'live') });
    renderApp(<DashboardPage id="crm" initialRange="30d" available={['crm', 'hr']} />);
    const refresh = await screen.findByRole('button', { name: /refresh/i });
    await waitFor(() => expect(refresh.hasAttribute('disabled')).toBe(false));
    const before = api.calls.length;
    fireEvent.click(refresh);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));

    const menu = await openMenu(screen.getByRole('button', { name: /switch/i }));
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
    expect(within(menu).getByRole('menuitem', { current: 'page' })).toBeTruthy();
  });

  it('offers a retry when the dashboard fails to load', async () => {
    const api = mockApi({ 'GET /api/dashboards/hr': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(
      <DashboardPage id="hr" initialRange={findDashboard('hr')!.defaultRange} available={['hr']} />,
    );
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('button', { name: /switch/i })).toBeNull();
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});
