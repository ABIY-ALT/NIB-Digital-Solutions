// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, navigation, page, renderApp, setLocation } from '@/testing/render';
import type { AuditLogEntry } from '../types';
import { AuditLogDetailDialog } from './audit-log-detail-dialog';
import { AuditLogPage } from './audit-log-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const entry = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  seq: '42',
  action: 'users.update',
  actorId: 'bbbbbbbb-1111-2222-3333-444444444444',
  actorUsername: 'admin',
  category: 'DATA_CHANGE',
  outcome: 'SUCCESS',
  errorCode: null,
  resourceType: 'User',
  resourceId: 'cccccccc-1111-2222-3333-444444444444',
  correlationId: 'dddddddd-1111-2222-3333-444444444444',
  ipAddress: '10.0.0.5',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  occurredAt: '2026-03-01T10:00:00Z',
  metadata: {
    approvalId: 'eeeeeeee-1111',
    reason: 'Quarterly review',
    nested: { a: 1 },
    empty: '',
  },
  changes: [
    {
      resourceType: 'User',
      resourceId: 'cccccccc-1111-2222-3333-444444444444',
      operation: 'update',
      fields: [
        { field: 'fullName', before: 'Ada', after: 'Ada Lovelace' },
        { field: 'roles', before: ['viewer'], after: ['viewer', 'admin'] },
        { field: 'password', before: null, after: null, redacted: true },
      ],
    },
    {
      resourceType: 'Role',
      resourceId: null,
      operation: 'create',
      proposed: true,
      fields: [],
    },
  ],
  prevHash: 'f'.repeat(64),
  hash: null,
  ...overrides,
});

describe('AuditLogDetailDialog', () => {
  const onFilter = vi.fn();
  const onOpenChange = vi.fn();
  beforeEach(() => {
    onFilter.mockClear();
    onOpenChange.mockClear();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  });

  const show = (e: AuditLogEntry | null | undefined, extra: Record<string, unknown> = {}) =>
    renderApp(
      <AuditLogDetailDialog
        open
        entry={e}
        onOpenChange={onOpenChange}
        onFilter={onFilter}
        {...extra}
      />,
    );

  it('explains a data change: summary, sections, diff and JSON views', async () => {
    show(entry());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Ada Lovelace/)).toBeTruthy();
    expect(within(dialog).getByText('Quarterly review')).toBeTruthy();
    expect(within(dialog).getByText(/"a": 1/)).toBeTruthy();
    expect(within(dialog).getAllByText(/internal network/i).length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole('radio', { name: /json/i }));
    expect(within(dialog).getAllByText(/"fullName"/).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('radio', { name: /compare/i }));

    // Filter links: actor, request, resource history.
    for (const button of within(dialog).getAllByRole('button', { name: /·/ }))
      fireEvent.click(button);
    expect(onFilter).toHaveBeenCalledWith({ actorId: entry().actorId });
    expect(onFilter).toHaveBeenCalledWith({ correlationId: entry().correlationId });
    expect(onFilter).toHaveBeenCalledWith({ resourceType: 'User', resourceId: entry().resourceId });

    // Copy a reference.
    fireEvent.click(within(dialog).getAllByRole('button', { name: /copy/i })[0]!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(entry().id);

    fireEvent.click(
      within(dialog)
        .getAllByRole('button', { name: /^close$/i })
        .at(-1)!,
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows failures and denials with their error, and unnamed actors', async () => {
    const { unmount } = show(
      entry({
        outcome: 'FAILURE',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
        category: 'AUTHENTICATION',
        action: 'auth.login',
        actorId: null,
        actorUsername: null,
        resourceType: null,
        resourceId: null,
        correlationId: null,
        ipAddress: '8.8.8.8',
        userAgent: null,
        metadata: null,
        changes: [],
        hash: 'a'.repeat(64),
      }),
    );
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/AUTH_INVALID_CREDENTIALS/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/public internet/i).length).toBeGreaterThan(0);
    unmount();

    const denied = show(
      entry({
        outcome: 'DENIED',
        errorCode: null,
        category: 'AUTHORIZATION',
        actorUsername: null,
        changes: [],
        metadata: {},
        action: 'users.create.requested',
      }),
    );
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/denied/i).length).toBeGreaterThan(0);
    denied.unmount();

    show(
      entry({
        actorId: null,
        actorUsername: null,
        category: 'SYSTEM',
        changes: [],
        outcome: 'FAILURE',
        errorCode: 'CUSTOM_CODE',
      }),
    );
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/CUSTOM_CODE/).length).toBeGreaterThan(0);
  });

  it('says when a data change recorded no field changes', async () => {
    show(entry({ changes: [], metadata: null }));
    expect(await screen.findByText(/no field|no changes/i)).toBeTruthy();
  });

  it('shows a skeleton while loading and "not found" without a record', async () => {
    const { unmount } = show(undefined, { loading: true });
    expect((await screen.findByRole('dialog')).querySelector('[aria-busy]')).toBeTruthy();
    unmount();
    show(null);
    expect(await screen.findByText(/does not exist/i)).toBeTruthy();
  });

  it('steps through the list it was opened from', async () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    show(entry(), { navigation: { index: 1, total: 3, onPrevious, onNext } });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /previous event/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /next event/i }));
    expect(onPrevious).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
    expect(within(dialog).getByText('2 of 3')).toBeTruthy();
  });
});

describe('AuditLogPage', () => {
  const records = [
    entry(),
    entry({
      id: 'r2',
      action: 'auth.login.failed',
      category: 'AUTHENTICATION',
      outcome: 'FAILURE',
      errorCode: 'AUTH_INVALID_CREDENTIALS',
      actorUsername: null,
      resourceType: null,
      changes: [],
      metadata: { attempts: 3, username: 'ghost', nested: { x: 1 } },
    }),
    entry({
      id: 'r3',
      action: 'roles.update.requested',
      changes: [
        {
          resourceType: 'Role',
          resourceId: 'x',
          operation: 'update',
          fields: ['a', 'b', 'c', 'd', 'e'].map((field) => ({ field, before: 1, after: 2 })),
        },
      ],
      resourceId: null,
    }),
    entry({ id: 'r4', changes: [], metadata: null, ipAddress: null }),
  ];

  const activity = {
    total: 120,
    failures: 4,
    denied: 2,
    distinctActors: 7,
    byCategory: [],
    topActions: [
      { action: 'users.update', count: 50 },
      { action: 'auth.login.failed', count: 4 },
      { action: 'roles.update', count: 3 },
      { action: 'ignored', count: 1 },
    ],
  };

  beforeEach(() => {
    setLocation('/audit');
    navigation.replace.mockClear();
  });

  const routes = (extra: Record<string, unknown> = {}) =>
    mockApi({
      'GET /api/audit-logs': page(records, { pageSize: 2, total: 4 }),
      'GET /api/audit-logs/activity': activity,
      'GET /api/audit-logs/facets': {
        actions: [{ action: 'users.update', count: 50 }],
        resourceTypes: ['User', 'Role'],
      },
      'GET /api/audit-logs/missing': entry({ id: 'missing', action: 'deep.linked' }),
      ...extra,
    });

  it('shows the activity strip and rows, and filters from the tiles', async () => {
    routes();
    renderApp(<AuditLogPage />);
    expect(await screen.findByText('120')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { pressed: false, name: /failures & denials/i }));
    for (const tile of screen.getAllByRole('button', { pressed: false })) {
      if (tile.textContent?.includes('50') || tile.textContent?.includes('3'))
        fireEvent.click(tile);
    }
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    const urls = navigation.replace.mock.calls.map(([u]) => decodeURIComponent(String(u)));
    expect(urls.some((u) => u.includes('filter[outcome]=in:FAILURE,DENIED'))).toBe(true);
  });

  it('marks active tile filters and the selected time window', async () => {
    setLocation(
      '/audit',
      'filter[outcome]=in:FAILURE,DENIED&filter[action]=users.update&filter[occurredAt]=custom',
    );
    routes();
    renderApp(<AuditLogPage />);
    await screen.findByText('120');
    expect(screen.getAllByRole('button', { pressed: true }).length).toBeGreaterThanOrEqual(2);
    for (const radio of screen.getAllByRole('radio')) fireEvent.click(radio);
    expect(navigation.replace).toHaveBeenCalled();
  });

  it('opens a record from the list and steps through the page', async () => {
    setLocation('/audit', 'id=r2');
    routes();
    renderApp(<AuditLogPage />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getAllByText(/AUTH_INVALID_CREDENTIALS/).length).toBeGreaterThan(0),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: /previous event/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /next event/i }));
    fireEvent.click(
      within(dialog)
        .getAllByRole('button', { name: /^close$/i })
        .at(-1)!,
    );
    const urls = navigation.replace.mock.calls.map(([u]) => String(u));
    expect(urls).toContain('/audit?id=aaaaaaaa-1111-2222-3333-444444444444');
    expect(urls).toContain('/audit?id=r3');
    expect(urls).toContain('/audit');
  });

  it('loads a deep-linked record that is not on the page and filters by its request', async () => {
    setLocation('/audit', 'id=missing&filter[category]=in:SYSTEM');
    routes();
    renderApp(<AuditLogPage />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getAllByText(/deep.linked|deep linked/i).length).toBeGreaterThan(0),
    );
    fireEvent.click(within(dialog).getAllByRole('button', { name: /same request/i })[0]!);
    const url = decodeURIComponent(String(navigation.replace.mock.calls.at(-1)![0]));
    expect(url).toContain('filter[correlationId]=dddddddd');
    expect(url).not.toContain('filter[category]');
  });

  it('opens rows, refreshes, searches and pages', async () => {
    const api = routes();
    renderApp(<AuditLogPage />);
    await screen.findByText('120');
    const view = await screen.findAllByRole('button', { name: /^view/i });
    fireEvent.click(view[0]!);
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining('id='), {
      scroll: false,
    });

    const before = api.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));

    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'admin' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /next page|next/i }));
    const urls = navigation.replace.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes('search=admin'))).toBe(true);
  });

  it('shows a retryable error when the list fails', async () => {
    const api = routes({ 'GET /api/audit-logs': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<AuditLogPage />);
    const retry = await screen.findByRole('button', { name: /try again/i });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});
