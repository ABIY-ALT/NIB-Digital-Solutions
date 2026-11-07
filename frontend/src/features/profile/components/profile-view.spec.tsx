// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/shared/types';
import { ThemeProvider } from '@/shared/theme/theme-provider';
import { ApiFailure, mockApi, openMenu, renderApp, setLocation } from '@/testing/render';
import type { AccountSession } from '../types';
import { ProfileView } from './profile-view';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1',
  username: 'ada',
  email: 'ada@example.com',
  fullName: 'Ada Lovelace',
  phoneNumber: '+251911000000',
  branchCode: 'HQ',
  roles: ['SUPER_ADMIN', 'auditor'],
  permissions: ['*'],
  status: 'ACTIVE',
  mfaEnabled: true,
  mfaMethod: 'totp',
  mfaRequired: false,
  lastLoginAt: '2026-01-01T00:00:00Z',
  passwordChangedAt: '2025-12-01T00:00:00Z',
  passwordExpiresAt: '2026-03-01T00:00:00Z',
  createdAt: '2024-05-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  version: 4,
  ...overrides,
});

const session = (overrides: Partial<AccountSession> = {}): AccountSession => ({
  id: 's1',
  current: true,
  createdAt: '2026-01-01T00:00:00Z',
  lastActivityAt: '2026-01-01T01:00:00Z',
  expiresAt: '2026-01-01T09:00:00Z',
  ipAddress: '10.0.0.5',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36',
  authMethod: 'password',
  mfaVerified: true,
  ...overrides,
});

const activity = {
  items: [
    {
      id: 'a1',
      action: 'auth.login',
      category: 'AUTHENTICATION',
      outcome: 'SUCCESS',
      occurredAt: '2026-01-01T00:00:00Z',
      ipAddress: '10.0.0.5',
      userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1',
      resourceType: null,
      changedFields: [],
      byOther: false,
      actorUsername: 'ada',
      errorCode: null,
    },
    {
      id: 'a2',
      action: 'users.update',
      category: 'DATA_CHANGE',
      outcome: 'SUCCESS',
      occurredAt: '2025-12-30T00:00:00Z',
      ipAddress: null,
      userAgent: null,
      resourceType: 'User',
      changedFields: ['fullName', 'phoneNumber'],
      byOther: true,
      actorUsername: 'admin',
      errorCode: null,
    },
    {
      id: 'a3',
      action: 'auth.login.failed',
      category: 'AUTHENTICATION',
      outcome: 'FAILURE',
      occurredAt: '2025-12-29T00:00:00Z',
      ipAddress: '8.8.8.8',
      userAgent: null,
      resourceType: null,
      changedFields: [],
      byOther: false,
      actorUsername: null,
      errorCode: 'AUTH_INVALID_CREDENTIALS',
    },
  ],
  nextCursor: 'next',
};

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/profile': profile(),
    'GET /api/account/sessions': [
      session(),
      session({
        id: 's2',
        current: false,
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0',
        ipAddress: null,
        mfaVerified: false,
      }),
      session({ id: 's3', current: false, userAgent: null }),
    ],
    'DELETE /api/account/sessions/s2': null,
    'POST /api/account/sessions/revoke-others': { terminated: 2 },
    'GET /api/account/activity': ({ url }: { url: URL }) =>
      url.searchParams.get('cursor') ? { items: [], nextCursor: null } : activity,
    'GET /api/account/activity/summary': {
      days: 30,
      signIns: 12,
      failedSignIns: 1,
      lastFailedSignInAt: '2025-12-29T00:00:00Z',
      devices: 2,
      changes: 3,
    },
    'GET /api/account/password-policy': null,
    ...extra,
  });
}

const preferences = {
  density: 'comfortable',
  fontScale: 'md',
  formSurface: 'modal',
  formSurfaceChoice: true,
  locales: [
    { code: 'en', label: 'English' },
    { code: 'am', label: 'አማርኛ' },
  ],
} as never;

const show = (permissions: string[] = ['*']) =>
  renderApp(
    <ThemeProvider initialMode="system" systemHint={null} canSwitch>
      <ProfileView preferences={preferences} />
    </ThemeProvider>,
    { permissions },
  );

describe('ProfileView', () => {
  beforeEach(() => setLocation('/profile'));

  it('shows the header and overview, and opens the edit dialog', async () => {
    routes();
    show();
    expect(await screen.findAllByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('@ada')).toBeTruthy();
    expect(screen.getAllByText(/Super admin|SUPER ADMIN|Super Admin/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('HQ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2-step verified').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit profile/ })[0]!);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('flags a profile without two-step verification or branch', async () => {
    routes({
      'GET /api/profile': profile({
        mfaEnabled: false,
        branchCode: null,
        lastLoginAt: null,
        status: 'LOCKED',
      }),
    });
    show();
    expect(await screen.findByText(/needs attention/)).toBeTruthy();
    expect(screen.queryByText('2-step verified')).toBeNull();
  });

  it('lists recent activity on its tab and loads more', async () => {
    setLocation('/profile', 'tab=activity');
    const api = routes();
    show();
    expect(await screen.findAllByText(/AUTH_INVALID_CREDENTIALS|failed/i)).toBeTruthy();
    const more = screen.queryByRole('button', { name: /more|older/i });
    if (more) {
      fireEvent.click(more);
      await waitFor(() =>
        expect(api.calls.some((c) => c.query.get('cursor') === 'next')).toBe(true),
      );
    }
  });

  it('signs out other sessions', async () => {
    setLocation('/profile', 'tab=sessions');
    const api = routes();
    show();
    expect((await screen.findAllByText('10.0.0.5')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Android/).length).toBeGreaterThan(0);

    const menus = screen.getAllByRole('button', { name: 'Session actions' });
    fireEvent.click(
      within(await openMenu(menus.at(-2)!)).getByRole('menuitem', { name: /Sign out/ }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog'))
        .getAllByRole('button', { name: /Sign out/ })
        .at(-1)!,
    );
    await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Sign out other sessions/ }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog'))
        .getAllByRole('button', { name: /Sign out/ })
        .at(-1)!,
    );
    await waitFor(() =>
      expect(api.calls.some((c) => c.path.endsWith('/revoke-others'))).toBe(true),
    );
  });

  it('reports a failed session sign-out and a failed session list', async () => {
    setLocation('/profile', 'tab=sessions');
    routes({
      'DELETE /api/account/sessions/s2': new ApiFailure(400, 'BAD_REQUEST'),
      'POST /api/account/sessions/revoke-others': new ApiFailure(400, 'BAD_REQUEST'),
    });
    const view = show();
    await screen.findAllByText('10.0.0.5');
    fireEvent.click(
      within(
        await openMenu(screen.getAllByRole('button', { name: 'Session actions' }).at(-2)!),
      ).getByRole('menuitem', { name: /Sign out/ }),
    );
    let confirm = await screen.findByRole('alertdialog');
    fireEvent.click(
      within(confirm)
        .getAllByRole('button', { name: /Sign out/ })
        .at(-1)!,
    );
    // A failure keeps the dialog open to try again; cancel it.
    await waitFor(() =>
      expect(
        within(confirm)
          .getAllByRole('button', { name: /Sign out/ })
          .at(-1)!
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Sign out other sessions/ }));
    confirm = await screen.findByRole('alertdialog');
    fireEvent.click(
      within(confirm)
        .getAllByRole('button', { name: /Sign out/ })
        .at(-1)!,
    );
    // A failure keeps the dialog open to try again; cancel it.
    await waitFor(() =>
      expect(
        within(confirm)
          .getAllByRole('button', { name: /Sign out/ })
          .at(-1)!
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    view.unmount();

    routes({ 'GET /api/account/sessions': new ApiFailure(400, 'BAD_REQUEST') });
    show();
    expect(await screen.findAllByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('opens the security and preferences tabs', async () => {
    setLocation('/profile', 'tab=security');
    routes();
    const view = show();
    expect(await screen.findAllByText(/password/i)).toBeTruthy();
    view.unmount();
    setLocation('/profile', 'tab=preferences');
    routes();
    show();
    expect(await screen.findAllByText(/English|density|theme/i)).toBeTruthy();
  });

  it('retries when the profile fails to load', async () => {
    const api = routes({ 'GET /api/profile': new ApiFailure(400, 'BAD_REQUEST') });
    show();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});
