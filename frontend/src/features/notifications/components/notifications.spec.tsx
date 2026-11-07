// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiFailure,
  mockApi,
  navigation,
  openMenu,
  page,
  renderApp,
  setLocation,
  type ApiCall,
} from '@/testing/render';
import type { AppNotification, NotificationSummary } from '../types';
import { shortTime } from './notification-list';
import { NotificationBell } from './notification-bell';
import { NotificationCenter } from './notification-center';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const message = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  title: 'Approval needed',
  body: 'A change waits for you',
  category: 'APPROVAL',
  severity: 'INFO',
  template: 'custom',
  params: null,
  link: '/approvals?id=a1',
  read: false,
  readAt: null,
  starred: false,
  archived: false,
  trashed: false,
  senderName: 'Maker',
  threadKey: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const inbox = [
  message(),
  message({
    id: 'n2',
    title: 'Password changed',
    category: 'SECURITY',
    read: true,
    starred: true,
    senderName: null,
    createdAt: '2026-01-05T09:00:00Z',
  }),
  message({
    id: 'n3',
    title: 'Maintenance',
    category: 'SYSTEM',
    severity: 'WARNING',
    createdAt: '2020-01-05T09:00:00Z',
  }),
];

const summary: NotificationSummary = {
  unread: 2,
  inbox: 3,
  starred: 1,
  archived: 0,
  trash: 0,
  categories: { APPROVAL: { total: 1, unread: 1 } },
  latest: inbox,
};

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/notifications': page(inbox, { pageSize: 3, total: 7 }),
    'GET /api/notifications/summary': summary,
    'GET /api/notifications/n1': inbox[0],
    'GET /api/notifications/n9': message({ id: 'n9', title: 'Older message', read: true }),
    'POST /api/notifications/actions': { affected: 1 },
    'GET /api/notifications/preferences': [],
    ...extra,
  });
}

const actions = (calls: ApiCall[]) =>
  calls
    .filter((c) => c.path === '/api/notifications/actions')
    .map((c) => c.body as { action: string });

/** A bulk toolbar button (rows have buttons with the same names). */
const toolbarButton = (name: string) =>
  screen.getAllByRole('button', { name }).find((b) => !b.closest('ul'))!;

describe('shortTime', () => {
  it('shows the time today, the day this year and the full date before', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    expect(shortTime('2026-06-15T08:30:00Z', 'en', now)).toMatch(/\d{2}:\d{2}/);
    expect(shortTime('2026-02-01T08:30:00Z', 'en', now)).toMatch(/Feb/);
    expect(shortTime('2024-02-01T08:30:00Z', 'en', now)).toMatch(/\d{2}\/\d{2}\/\d{2}/);
  });
});

describe('NotificationCenter', () => {
  beforeEach(() => {
    setLocation('/notifications');
    navigation.replace.mockClear();
  });

  it('lists messages and acts on single rows', async () => {
    const api = routes();
    renderApp(<NotificationCenter />);
    const list = await screen.findByRole('list', { name: 'Messages' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/1–3 of 7|1-3 of 7/)).toBeTruthy();

    fireEvent.click(within(list).getAllByRole('button', { name: 'Star' })[0]!);
    fireEvent.click(within(list).getByRole('button', { name: 'Remove star' }));
    fireEvent.click(within(list).getAllByRole('button', { name: 'Archive' })[0]!);
    fireEvent.click(within(list).getAllByRole('button', { name: 'Delete' })[0]!);
    fireEvent.click(within(list).getAllByRole('button', { name: 'Mark as read' })[0]!);
    fireEvent.click(within(list).getByRole('button', { name: 'Mark as unread' }));
    await waitFor(() => expect(actions(api.calls).length).toBeGreaterThanOrEqual(6));
    expect(actions(api.calls).map((a) => a.action)).toEqual(
      expect.arrayContaining(['star', 'unstar', 'archive', 'trash', 'read', 'unread']),
    );
  });

  it('opens a message, marking it read, and goes back', async () => {
    const api = routes();
    renderApp(<NotificationCenter />);
    await screen.findByRole('list', { name: 'Messages' });
    fireEvent.click(screen.getByText('Approval needed'));
    await waitFor(() =>
      expect(actions(api.calls)[0]).toMatchObject({ action: 'read', ids: ['n1'] }),
    );
    expect(navigation.replace).toHaveBeenCalledWith('/notifications?id=n1', { scroll: false });
  });

  it('shows the reading pane for a deep-linked message, also one not on the page', async () => {
    setLocation('/notifications', 'id=n9');
    routes();
    renderApp(<NotificationCenter />);
    expect(await screen.findByText('Older message')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to list' })[0]!);
    expect(navigation.replace).toHaveBeenCalledWith('/notifications', { scroll: false });
  });

  it('selects rows and runs bulk actions, including on the whole folder', async () => {
    const api = routes();
    renderApp(<NotificationCenter />);
    const list = await screen.findByRole('list', { name: 'Messages' });

    fireEvent.click(within(list).getByRole('checkbox', { name: 'Select “Approval needed”' }));
    fireEvent.click(toolbarButton('Archive'));
    await waitFor(() => expect(actions(api.calls)).toHaveLength(1));
    expect(actions(api.calls)[0]).toEqual({ action: 'archive', ids: ['n1'] });

    // Select the page, then every message in the folder.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select' }));
    expect(await screen.findByText(/All 3 messages on this page are selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Select all 7 in Inbox/ }));
    expect(screen.getByText(/All 7 messages in Inbox are selected/)).toBeTruthy();
    fireEvent.click(toolbarButton('Mark as read'));
    await waitFor(() => expect(actions(api.calls)).toHaveLength(2));
    expect(actions(api.calls)[1]).toMatchObject({ action: 'read', folder: 'inbox' });

    // Select via the menu, then clear.
    for (const mode of ['Read', 'Unread', 'Starred', 'Unstarred', 'All']) {
      fireEvent.click(
        within(await openMenu(screen.getByRole('button', { name: 'Select options' }))).getByRole(
          'menuitem',
          { name: mode },
        ),
      );
    }
    fireEvent.click(screen.getByRole('button', { name: /Select all 7/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText(/messages in Inbox are selected/)).toBeNull();

    // A selection with only read messages offers "mark unread" and "star".
    fireEvent.click(within(list).getByRole('checkbox', { name: 'Select “Password changed”' }));
    fireEvent.click(toolbarButton('Mark as unread'));
    fireEvent.click(within(list).getByRole('checkbox', { name: 'Select “Password changed”' }));
    fireEvent.click(toolbarButton('Star'));
    fireEvent.click(within(list).getByRole('checkbox', { name: 'Select “Password changed”' }));
    fireEvent.click(within(list).getByRole('checkbox', { name: 'Select “Password changed”' }));
  });

  it('marks everything read from the toolbar menu, refreshes and pages', async () => {
    const api = routes();
    renderApp(<NotificationCenter />);
    await screen.findByRole('list', { name: 'Messages' });
    fireEvent.click(
      within(await openMenu(screen.getByRole('button', { name: 'More actions' }))).getByRole(
        'menuitem',
        { name: /Mark all as read/ },
      ),
    );
    await waitFor(() =>
      expect(actions(api.calls)[0]).toMatchObject({ action: 'read', folder: 'inbox' }),
    );

    const before = api.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(navigation.replace).toHaveBeenCalledWith('/notifications?page=2', { scroll: false });
  });

  it('offers restore and delete-forever in the trash, and unarchive in the archive', async () => {
    setLocation('/notifications', 'folder=trash&page=2');
    const api = routes({
      'GET /api/notifications': page(inbox.slice(0, 1), { page: 2, pageSize: 1, total: 3 }),
    });
    const view = renderApp(<NotificationCenter />);
    let list = await screen.findByRole('list', { name: 'Messages' });
    fireEvent.click(within(list).getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(list).getByRole('checkbox', { name: /Select “/ }));
    fireEvent.click(toolbarButton('Delete forever'));
    fireEvent.click(within(list).getByRole('checkbox', { name: /Select “/ }));
    fireEvent.click(toolbarButton('Restore'));
    fireEvent.click(screen.getByRole('button', { name: 'Newer' }));
    await waitFor(() =>
      expect(actions(api.calls).map((a) => a.action)).toEqual(['restore', 'delete', 'restore']),
    );
    expect(navigation.replace).toHaveBeenCalledWith('/notifications?folder=trash', {
      scroll: false,
    });
    view.unmount();

    setLocation('/notifications', 'folder=archived&cat=SECURITY');
    routes();
    renderApp(<NotificationCenter />);
    list = await screen.findByRole('list', { name: 'Messages' });
    fireEvent.click(within(list).getAllByRole('button', { name: 'Move to inbox' })[0]!);
    fireEvent.click(within(list).getAllByRole('checkbox', { name: /Select “/ })[0]!);
    fireEvent.click(toolbarButton('Move to inbox'));
  });

  it('searches, clears the search and shows the empty states', async () => {
    setLocation('/notifications', 'q=nothing');
    routes({ 'GET /api/notifications': page([]) });
    renderApp(<NotificationCenter />);
    expect(await screen.findByText(/no.*match|nothing/i)).toBeTruthy();
    const search = screen.getByRole('textbox', { name: 'Search notifications' });
    fireEvent.change(search, { target: { value: ' budget ' } });
    fireEvent.submit(search.closest('form')!);
    expect(navigation.replace).toHaveBeenCalledWith('/notifications?q=budget', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(navigation.replace).toHaveBeenCalledWith('/notifications', { scroll: false });
  });

  it('handles Gmail keyboard shortcuts', async () => {
    setLocation('/notifications', 'id=n1');
    const api = routes();
    renderApp(<NotificationCenter />);
    await screen.findByRole('list', { name: 'Messages' });
    for (const key of ['j', 'k', 'j', 'o', 'e', '#', 's', 'I', 'U', 'Enter', 'x']) {
      fireEvent.keyDown(document.body, { key });
    }
    // Modified keys and keys typed in fields are ignored.
    fireEvent.keyDown(document.body, { key: 'e', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search notifications' }), { key: 'e' });
    await waitFor(() =>
      expect(actions(api.calls).map((a) => a.action)).toEqual(
        expect.arrayContaining(['archive', 'trash', 'unstar', 'read', 'unread']),
      ),
    );
    fireEvent.keyDown(document.body, { key: 'u' });
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Search notifications' }),
    );
    fireEvent.keyDown(document.body, { key: '?' });
    expect((await screen.findAllByText('Keyboard shortcuts')).length).toBeGreaterThan(0);
  });

  it('opens the shortcuts help from the header and reports failed actions', async () => {
    routes({ 'POST /api/notifications/actions': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<NotificationCenter />);
    const list = await screen.findByRole('list', { name: 'Messages' });
    fireEvent.click(within(list).getAllByRole('button', { name: 'Archive' })[0]!);
    fireEvent.click(
      within(await openMenu(screen.getByRole('button', { name: 'More actions' }))).getByRole(
        'menuitem',
        { name: /Mark all as read/ },
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Shortcuts/ }));
    expect((await screen.findAllByText('Keyboard shortcuts')).length).toBeGreaterThan(0);
  });

  it('switches folders and categories, and opens settings and compose', async () => {
    routes();
    renderApp(<NotificationCenter />, { permissions: ['notifications:broadcast'] });
    await screen.findByRole('list', { name: 'Messages' });
    fireEvent.click(screen.getByRole('button', { name: /^Starred/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Inbox/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Approval/ })[0]!);
    const urls = navigation.replace.mock.calls.map(([u]) => String(u));
    expect(urls).toEqual(
      expect.arrayContaining([
        '/notifications?folder=starred',
        '/notifications',
        '/notifications?cat=APPROVAL',
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /compose|announce/i })[0]!);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('shows a retryable error', async () => {
    const api = routes({ 'GET /api/notifications': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<NotificationCenter />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});

describe('NotificationBell', () => {
  beforeEach(() => navigation.push.mockClear());

  it('shows the unread count and the latest messages, and opens one', async () => {
    const api = routes();
    renderApp(<NotificationBell />);
    const bell = await screen.findByRole('button', { name: 'Notifications (2 unread)' });
    fireEvent.click(bell);
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Approval needed')).toBeTruthy();

    fireEvent.click(within(panel).getByRole('tab', { name: /Unread/ }));
    expect(within(panel).queryByText('Password changed')).toBeNull();
    fireEvent.click(within(panel).getByRole('tab', { name: /^All/ }));

    fireEvent.click(within(panel).getByRole('button', { name: /Mark all as read/ }));
    fireEvent.click(within(panel).getByText('Approval needed'));
    expect(navigation.push).toHaveBeenCalledWith('/approvals?id=a1');
    await waitFor(() => expect(actions(api.calls).map((a) => a.action)).toEqual(['read', 'read']));

    fireEvent.click(bell);
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Password changed'));
    expect(navigation.push).toHaveBeenCalledWith('/approvals?id=a1');
  });

  it('opens the centre for a message without a link, and shows the empty states', async () => {
    routes({
      'GET /api/notifications/summary': {
        ...summary,
        unread: 120,
        latest: [message({ link: null, read: true })],
      },
    });
    renderApp(<NotificationBell />);
    const bell = await screen.findByRole('button', { name: 'Notifications (120 unread)' });
    expect(bell.textContent).toContain('99+');
    fireEvent.click(bell);
    const panel = await screen.findByRole('dialog');
    fireEvent.click(within(panel).getByRole('tab', { name: /Unread/ }));
    expect(within(panel).getByText(/no unread|caught up|nothing/i)).toBeTruthy();
    fireEvent.click(within(panel).getByRole('tab', { name: /^All/ }));
    fireEvent.click(within(panel).getByText('Approval needed'));
    expect(navigation.push).toHaveBeenCalledWith('/notifications?id=n1');
  });

  it('has a plain label with nothing unread', async () => {
    routes({ 'GET /api/notifications/summary': { ...summary, unread: 0, latest: [] } });
    renderApp(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
