// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HorizontalLayout } from '@/shared/layouts/layouts';
import { ThemeProvider } from '@/shared/theme/theme-provider';
import {
  messages,
  mockApi,
  navigation,
  openMenu,
  renderApp,
  setLocation,
  testUser,
} from '@/testing/render';
import AppLayout from './layout';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}));
const shell = vi.hoisted(() => ({ user: null as unknown, update: vi.fn() }));
vi.mock('@/features/auth/api/session', () => ({ requireUser: () => Promise.resolve(shell.user) }));
vi.mock('next-intl/server', async () => {
  const { messages: catalogue } = await import('@/testing/render');
  return {
    getTranslations: () => Promise.resolve(createTranslator({ locale: 'en', messages: catalogue })),
  };
});
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { expires: '2099-01-01T00:00:00Z' },
    status: 'authenticated',
    update: shell.update,
  }),
}));

const ADMIN = ['*'];

function routes(profile: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/notifications/summary': {
      unread: 1,
      inbox: 1,
      starred: 0,
      archived: 0,
      trash: 0,
      categories: {},
      latest: [],
    },
    'GET /api/profile': {
      id: 'u-1',
      username: 'admin',
      fullName: 'Ada Admin',
      email: 'admin@example.com',
      roles: ['SUPER_ADMIN'],
      permissions: ['*'],
      status: 'ACTIVE',
      mfaEnabled: false,
      mfaRequired: true,
      passwordExpiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      passwordChangedAt: '2026-01-01T00:00:00Z',
      lastLoginAt: null,
      createdAt: '2025-01-01T00:00:00Z',
      ...profile,
    },
    'GET /api/auth/password-policy': { expiryWarningDays: 14, minLength: 10 },
    'GET /api/search': ({ url }: { url: URL }) => ({
      query: url.searchParams.get('q'),
      records: [
        {
          id: 'r1',
          source: 'users',
          title: 'Abebe Kebede',
          subtitle: 'abebe',
          badge: 'ACTIVE',
          href: '/users?id=r1',
        },
        { id: 'r2', source: 'roles', title: 'Auditor', href: '/roles?id=r2' },
      ],
      failed: ['audit'],
    }),
    'POST /api/locale': null,
    'POST /api/auth/logout': { redirectTo: '/login?reason=signed_out' },
  });
}

/** The shell as the server renders it, for a user with these permissions. */
async function renderShell(
  permissions = ADMIN,
  transform?: (layout: ReactElement) => ReactElement,
) {
  shell.user = testUser(permissions, { roles: ['SUPER_ADMIN'], branchCode: 'HQ' });
  const tree = (await AppLayout({ children: <p>Page body</p> })) as ReactElement<{
    children: ReactElement[];
  }>;
  const [layout, guard] = tree.props.children;
  const content = cloneElement(tree, {}, transform ? transform(layout!) : layout, guard);
  return renderApp(
    <ThemeProvider initialMode="light" systemHint={null} canSwitch>
      {content}
    </ThemeProvider>,
    { permissions },
  );
}

describe('application shell', () => {
  beforeEach(() => {
    setLocation('/users');
    navigation.push.mockClear();
    window.localStorage.clear();
  });

  it('renders the navigation the user may see, the header actions and the page', async () => {
    routes();
    await renderShell();
    expect(screen.getByText('Page body')).toBeTruthy();
    const nav = screen.getAllByRole('navigation')[0]!;
    expect(within(nav).getAllByRole('link').length).toBeGreaterThan(3);
    expect(screen.getByRole('link', { name: /skip/i })).toBeTruthy();
    // Account notices: two-step verification required and a password about to expire.
    expect(await screen.findAllByRole('link', { name: /set up|change|turn on/i })).toBeTruthy();
  });

  it('hides what a user without permissions may not open', async () => {
    routes({ mfaRequired: false, passwordExpiresAt: null });
    await renderShell([]);
    expect(screen.queryByRole('link', { name: /^Users$/ })).toBeNull();
  });

  it('filters the sidebar, folds sections and collapses the rail', async () => {
    routes();
    await renderShell();
    const search = screen.getAllByPlaceholderText('Search menu')[0]!;
    fireEvent.change(search, { target: { value: 'audt' } });
    expect(screen.getAllByRole('link', { name: /audit/i }).length).toBeGreaterThan(0);
    fireEvent.change(search, { target: { value: 'zzzzzz' } });
    expect(screen.getAllByText('No matching pages').length).toBeGreaterThan(0);
    fireEvent.change(search, { target: { value: '' } });

    for (const section of screen.getAllByRole('button', { expanded: true }).slice(0, 2))
      fireEvent.click(section);
    fireEvent.click(screen.getAllByRole('button', { name: /toggle sidebar|collapse/i })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open navigation' })[0]!);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('searches pages, actions and records from quick search', async () => {
    routes();
    await renderShell();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'users' } });
    expect((await screen.findAllByText('Abebe Kebede')).length).toBeGreaterThan(0);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigation.push).toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: '/' });
    const again = await screen.findByRole('combobox');
    // Recent entries come back with nothing typed, and can be removed.
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    fireEvent.change(again, { target: { value: 'dark' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    const input3 = await screen.findByRole('combobox');
    fireEvent.change(input3, { target: { value: 'አማርኛ' } });
    fireEvent.keyDown(input3, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'sign out' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  });

  it('opens the account menu and switches theme and language', async () => {
    const api = routes();
    await renderShell();
    const menu = await openMenu(screen.getAllByRole('button', { name: 'Account menu' }).at(-1)!);
    expect(within(menu).getAllByText(/Ada Admin|admin/).length).toBeGreaterThan(0);
    const subs = within(menu).queryAllByRole('menuitem', { name: /appearance|theme|language/i });
    for (const sub of subs) {
      fireEvent.keyDown(sub, { key: 'ArrowRight' });
    }
    const radios = screen.queryAllByRole('menuitemradio');
    if (radios.length) fireEvent.click(radios.at(-1)!);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
  });

  it('renders the horizontal layout with the top navigation', async () => {
    routes();
    await renderShell(ADMIN, (layout) => {
      const props = layout.props as Record<string, unknown>;
      return <HorizontalLayout {...(props as Parameters<typeof HorizontalLayout>[0])} />;
    });
    expect(screen.getByText('Page body')).toBeTruthy();
    const triggers = screen.getAllByRole('button', { expanded: false });
    fireEvent.click(triggers[0]!);
    fireEvent.keyDown(triggers[0]!, { key: 'ArrowDown' });
  });
});

describe('session guard', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('warns before the idle timeout, keeps the session on activity, and signs out on expiry', async () => {
    const api = routes();
    await renderShell();
    act(() => vi.advanceTimersByTime(25 * 60 * 1000));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /stay|continue|keep/i })[0]!);
    act(() => vi.advanceTimersByTime(61_000));
    fireEvent.pointerDown(window);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('appcore:session-expired', { detail: { code: 'AUTH_SESSION_EXPIRED' } }),
      );
    });
    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/auth/logout')).toBe(true));
  });
});

void messages;
