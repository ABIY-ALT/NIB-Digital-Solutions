// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, navigation, page, renderApp, setLocation } from '@/testing/render';
import type { ApprovalRequest } from '../types';
import { ApprovalsPage } from './approvals-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const request = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'a1',
  action: 'roles.update',
  resourceType: 'Role',
  resourceId: 'r1',
  summary: 'Update role Teller',
  status: 'PENDING',
  maker: { id: 'u2', name: 'Maker Person' },
  checker: null,
  makerComment: 'Quarterly review',
  checkerComment: null,
  checkerPermissions: ['roles:approve'],
  before: { name: 'Teller', permissions: ['users:read'] },
  after: { name: 'Teller II', permissions: ['users:read', 'audit:read'] },
  changes: [],
  canDecide: true,
  canCancel: false,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-03-01T10:00:00Z',
  expiresAt: '2099-03-08T10:00:00Z',
  decidedAt: null,
  version: 1,
  ...overrides,
});

const requests = [
  request(),
  request({
    id: 'a2',
    summary: 'Delete user jdoe',
    status: 'APPROVED',
    checker: { id: 'u1', name: 'Checker' },
    canDecide: false,
    decidedAt: '2026-03-02T10:00:00Z',
    checkerComment: 'Fine',
  }),
  request({
    id: 'a3',
    summary: 'Rejected change',
    status: 'REJECTED',
    checker: { id: 'u1', name: 'Checker' },
    canDecide: false,
    checkerComment: 'No',
  }),
  request({
    id: 'a4',
    summary: 'Failed change',
    status: 'FAILED',
    canDecide: false,
    errorMessage: 'Version conflict',
  }),
  request({
    id: 'a5',
    summary: 'My request',
    canDecide: false,
    canCancel: true,
    makerComment: null,
  }),
  request({ id: 'a6', summary: 'Expired', status: 'EXPIRED', canDecide: false }),
];

function routes(extra: Record<string, unknown> = {}) {
  const byId = Object.fromEntries(requests.map((r) => [`GET /api/approvals/${r.id}`, r]));
  return mockApi({
    'GET /api/approvals': page(requests, { pageSize: 6, total: 12 }),
    'GET /api/approvals/summary': { inbox: 3, mine: 1 },
    ...byId,
    'POST /api/approvals/a1/approve': request({ status: 'APPROVED' }),
    'POST /api/approvals/a1/reject': request({ status: 'REJECTED' }),
    'POST /api/approvals/a5/cancel': request({ id: 'a5', status: 'CANCELLED' }),
    ...extra,
  });
}

const posted = (api: ReturnType<typeof routes>) => api.calls.filter((c) => c.method === 'POST');

describe('ApprovalsPage', () => {
  beforeEach(() => {
    setLocation('/approvals');
    navigation.replace.mockClear();
  });

  it('lists requests with their status notes and switches boxes', async () => {
    routes();
    renderApp(<ApprovalsPage />, { permissions: ['approvals:read'] });
    expect(await screen.findByText('Update role Teller')).toBeTruthy();
    expect(screen.getAllByText('Checker').length).toBeGreaterThan(0);
    expect(screen.getByText('3')).toBeTruthy();

    const tab = screen.getByRole('tab', { name: /All requests/ });
    fireEvent.mouseDown(tab);
    fireEvent.keyDown(tab, { key: 'Enter' });
    fireEvent.click(tab);
    fireEvent.focus(tab);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    expect(String(navigation.replace.mock.calls[0]![0])).toContain('box=all');
  });

  it('filters by status outside the inbox, searches and pages', async () => {
    setLocation('/approvals', 'box=mine&status=PENDING,APPROVED');
    routes();
    renderApp(<ApprovalsPage />);
    await screen.findByText('Update role Teller');
    expect(screen.queryByRole('tab', { name: /All requests/ })).toBeNull();
    const statuses = within(screen.getByRole('group', { name: /status/i }));
    expect(statuses.getByRole('button', { name: 'Pending' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(statuses.getByRole('button', { name: 'Rejected' }));
    fireEvent.click(statuses.getByRole('button', { name: 'All' }));
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'role' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    const urls = navigation.replace.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('status=REJECTED'))).toBe(true);
    expect(urls.some((u) => u.includes('q=role'))).toBe(true);
    expect(urls.some((u) => u.includes('page=2'))).toBe(true);
  });

  it('shows the empty inbox and other empty boxes', async () => {
    routes({ 'GET /api/approvals': page([]) });
    const view = renderApp(<ApprovalsPage />);
    expect(await screen.findByText(/nothing waiting|all caught up|no requests/i)).toBeTruthy();
    view.unmount();
    setLocation('/approvals', 'box=history&q=x');
    renderApp(<ApprovalsPage />);
    expect(await screen.findAllByText(/no /i)).toBeTruthy();
  });

  it('retries a failed list', async () => {
    const api = routes({ 'GET /api/approvals': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<ApprovalsPage />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });

  it('opens a request from its row', async () => {
    routes();
    renderApp(<ApprovalsPage />);
    fireEvent.click(await screen.findByText('Delete user jdoe'));
    expect(navigation.replace).toHaveBeenCalledWith('/approvals?id=a2', { scroll: false });
  });
});

describe('ApprovalDetailDrawer', () => {
  beforeEach(() => navigation.replace.mockClear());

  const openDrawer = async (id: string) => {
    setLocation('/approvals', `id=${id}`);
    const api = routes();
    const view = renderApp(<ApprovalsPage />);
    const drawer = await screen.findByRole('dialog');
    return { api, drawer, view };
  };

  it('needs a reason to reject, then rejects', async () => {
    const { api, drawer } = await openDrawer('a1');
    expect(await within(drawer).findByText('Quarterly review')).toBeTruthy();
    expect(within(drawer).getAllByText(/Teller II/).length).toBeGreaterThan(0);
    fireEvent.click(within(drawer).getByRole('button', { name: /Reject/ }));
    expect(within(drawer).getByText(/at least 3 characters/)).toBeTruthy();
    fireEvent.change(within(drawer).getByRole('textbox'), { target: { value: 'Not now' } });
    fireEvent.click(within(drawer).getByRole('button', { name: /Reject/ }));
    await waitFor(() =>
      expect(posted(api)[0]).toMatchObject({
        path: '/api/approvals/a1/reject',
        body: { comment: 'Not now' },
      }),
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/approvals', { scroll: false }),
    );
  });

  it('approves with an optional comment', async () => {
    const { api, drawer } = await openDrawer('a1');
    fireEvent.click(await within(drawer).findByRole('button', { name: /Approve/ }));
    await waitFor(() =>
      expect(posted(api)[0]).toMatchObject({
        path: '/api/approvals/a1/approve',
        body: { comment: null },
      }),
    );
  });

  it('reports an approval that failed to apply, and errors', async () => {
    setLocation('/approvals', 'id=a1');
    routes({
      'POST /api/approvals/a1/approve': request({ status: 'FAILED', errorMessage: 'Conflict' }),
      'POST /api/approvals/a1/reject': new ApiFailure(409, 'APPROVAL_NOT_PENDING'),
    });
    renderApp(<ApprovalsPage />);
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(await within(drawer).findByRole('textbox'), { target: { value: 'Reason' } });
    fireEvent.click(within(drawer).getByRole('button', { name: /Reject/ }));
    fireEvent.click(within(drawer).getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
  });

  it('lets the maker withdraw a pending request', async () => {
    const { api, drawer } = await openDrawer('a5');
    fireEvent.click(await within(drawer).findByRole('button', { name: /Withdraw request/ }));
    await waitFor(() => expect(posted(api)[0]).toMatchObject({ path: '/api/approvals/a5/cancel' }));
  });

  it('shows decided, rejected, failed and expired requests read-only', async () => {
    for (const [id, text] of [
      ['a2', 'Fine'],
      ['a3', 'No'],
      ['a4', 'Version conflict'],
      ['a6', 'Expired'],
    ] as const) {
      const { drawer, view } = await openDrawer(id);
      expect((await within(drawer).findAllByText(text)).length).toBeGreaterThan(0);
      expect(within(drawer).queryByRole('button', { name: /Approve/ })).toBeNull();
      fireEvent.click(within(drawer).getAllByRole('button', { name: /close/i }).at(-1)!);
      expect(navigation.replace).toHaveBeenLastCalledWith('/approvals', { scroll: false });
      view.unmount();
    }
  });

  it('retries a request that failed to load', async () => {
    setLocation('/approvals', 'id=zz');
    const api = routes({ 'GET /api/approvals/zz': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<ApprovalsPage />);
    const drawer = await screen.findByRole('dialog');
    const retry = await within(drawer).findByRole('button', { name: 'Try again' });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});
