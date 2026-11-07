// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, renderApp, testUser } from '@/testing/render';
import { DashboardView } from './dashboard-view';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const activity = [
  {
    id: 'e1',
    action: 'users.update',
    outcome: 'SUCCESS',
    actorUsername: 'admin',
    occurredAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'e2',
    action: 'auth.login',
    outcome: 'FAILURE',
    actorUsername: null,
    occurredAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'e3',
    action: 'roles.delete',
    outcome: 'DENIED',
    actorUsername: 'jdoe',
    occurredAt: '2026-01-01T00:00:00Z',
  },
];

describe('DashboardView', () => {
  it('greets the user and shows statistics, activity and the session', async () => {
    mockApi({
      'GET /api/dashboard': {
        userStats: { total: 48, active: 40, locked: 3, disabled: 5 },
        recentActivity: activity,
        sessionEndsAt: '2026-01-01T08:00:00Z',
      },
      'GET /api/approvals/summary': { inbox: 2, mine: 1 },
    });
    renderApp(<DashboardView />, {
      user: testUser([], {
        name: 'Ada Lovelace',
        branchCode: 'HQ',
        mfaEnabled: true,
        roles: ['ADMIN', 'AUDITOR'],
      }),
    });
    expect(await screen.findByText('48')).toBeTruthy();
    expect(screen.getAllByText(/Ada/).length).toBeGreaterThan(0);
    expect(screen.getByText('users.update')).toBeTruthy();
    expect(screen.getByText('DENIED')).toBeTruthy();
    expect(screen.getByText('@admin')).toBeTruthy();
    expect(screen.getByText('HQ')).toBeTruthy();
    expect(screen.getByText('AUDITOR')).toBeTruthy();
  });

  it('explains when activity is hidden or empty, and with no signed-in user', async () => {
    mockApi({
      'GET /api/dashboard': { userStats: null, recentActivity: null, sessionEndsAt: '' },
    });
    const view = renderApp(<DashboardView />, { user: null });
    expect(await screen.findByText(/permission|access/i)).toBeTruthy();
    view.unmount();

    mockApi({ 'GET /api/dashboard': { userStats: null, recentActivity: [], sessionEndsAt: '' } });
    renderApp(<DashboardView />);
    expect(await screen.findByText(/no recent|nothing|no activity/i)).toBeTruthy();
  });

  it('renders the highlights and insights when the flag is on', async () => {
    mockApi({
      'GET /api/dashboard': { userStats: null, recentActivity: [], sessionEndsAt: '' },
      'GET /api/approvals/summary': { inbox: 0, mine: 0 },
    });
    const { container } = renderApp(<DashboardView />, { flags: { dashboardInsights: true } });
    await waitFor(() => expect(container.querySelectorAll('svg').length).toBeGreaterThan(10), {
      timeout: 15_000,
    });
  });

  describe('NIB Digital Solutions workspace', () => {
    const workspace = {
      demoRequests: { new: 6, waiting: 2 },
      inquiries: { new: 4, waiting: 0 },
      ideas: { submitted: 2, underReview: 1 },
      questions: { open: 2, inProgress: 3 },
      latestLeads: [
        {
          kind: 'demo',
          id: 'd1',
          reference: 'DEMO-261107-7KQ4M',
          name: 'Selam Tadesse',
          organization: 'Bright Future Academy',
          productSlug: 'school-management-system',
          type: 'online',
          status: 'new',
          assignedTo: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      catalogue: { published: 12, total: 14, comingSoon: 2, pilot: 3, heroSlides: 4 },
    };
    const analytics = {
      days: 30,
      totalProducts: 14,
      publishedProducts: 12,
      productViews: 5380,
      demoPlays: 812,
      assistantQueries: 40,
      demoRequests: 38,
      inquiries: 27,
      daily: [
        { date: '2026-11-06', views: 180, leads: 2 },
        { date: '2026-11-07', views: 210, leads: 3 },
      ],
      leadsByStatus: {
        new: 9,
        contacted: 14,
        scheduled: 11,
        completed: 9,
        qualified: 8,
        closed_won: 5,
        closed_lost: 9,
      },
      leadsBySource: [{ source: 'homepage', count: 22 }],
      leadsByIndustry: [],
      openByOwner: [{ ownerId: null, count: 3 }],
      topViewed: [{ slug: 'school-management-system', count: 1180 }],
      topRequested: [{ slug: 'saccos-automation', count: 8 }],
      topWatched: [],
    };
    const names = {
      'school-management-system': 'School Management System',
      'saccos-automation': 'SACCOS Automation',
    };
    const staff = [
      'demo-requests:read',
      'product-inquiries:read',
      'product-ideas:read',
      'product-questions:read',
      'digital-products:read',
      'digital-products:create',
      'hero-slides:read',
    ];

    it('shows what needs attention, the latest leads and the catalogue', async () => {
      mockApi({
        'GET /api/dashboard': {
          workspace,
          userStats: null,
          recentActivity: null,
          sessionEndsAt: '',
        },
      });
      renderApp(<DashboardView productNames={names} />, { user: testUser(staff) });

      const demos = await screen.findByRole('link', { name: /New demo requests/ });
      expect(demos.getAttribute('href')).toBe(
        '/demo-requests?filter[status]=new&sort=createdAt:asc',
      );
      expect(demos.textContent).toContain('2 waiting over 24 hours');
      expect(screen.getByRole('link', { name: /New product inquiries/ }).textContent).toContain(
        'None waiting over 24 hours',
      );
      expect(screen.getByText('2 submitted · 1 under review')).toBeTruthy();
      expect(screen.getByText('2 open · 3 in progress')).toBeTruthy();

      expect(screen.getByRole('link', { name: 'DEMO-261107-7KQ4M' })).toBeTruthy();
      expect(screen.getByText('School Management System')).toBeTruthy();
      expect(screen.getByText('Demo request · Online demo')).toBeTruthy();
      expect(screen.getByText('Unassigned')).toBeTruthy();

      expect(screen.getByText('Products published')).toBeTruthy();
      expect(screen.getByText('Hero slides live')).toBeTruthy();
      expect(screen.getByRole('link', { name: /Add product/ }).getAttribute('href')).toBe(
        '/digital-products/new',
      );
      // Without the analytics permission there are no website figures (and no request for them).
      expect(screen.queryByText('Website and pipeline')).toBeNull();
      // The general overview is replaced.
      expect(screen.queryByText('Recent activity')).toBeNull();
    });

    it('shows the website figures for the chosen period to analytics readers', async () => {
      const api = mockApi({
        'GET /api/dashboard': {
          workspace,
          userStats: null,
          recentActivity: null,
          sessionEndsAt: '',
        },
        'GET /api/marketplace/admin/analytics': ({ url }: { url: URL }) => ({
          ...analytics,
          days: Number(url.searchParams.get('days')),
        }),
      });
      renderApp(<DashboardView productNames={names} />, {
        user: testUser([...staff, 'marketplace-analytics:read']),
      });

      expect(await screen.findByText('Website and pipeline')).toBeTruthy();
      expect(await screen.findByText('5,380')).toBeTruthy();
      expect(screen.getByText('Pipeline by status')).toBeTruthy();
      expect(screen.getByText('65 leads')).toBeTruthy();
      expect(screen.getAllByText('School Management System').length).toBeGreaterThan(1);

      fireEvent.click(screen.getByRole('button', { name: 'Most requested' }));
      expect(screen.getByText('SACCOS Automation')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: '7 days' }));
      await waitFor(() =>
        expect(
          api.calls.some(
            (c) => c.path === '/api/marketplace/admin/analytics' && c.query.get('days') === '7',
          ),
        ).toBe(true),
      );
    });
  });

  it('offers a retry when the dashboard fails to load', async () => {
    const api = mockApi({ 'GET /api/dashboard': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<DashboardView />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});
