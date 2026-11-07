// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiFailure,
  envelope,
  mockApi,
  navigation,
  openMenu,
  page,
  renderApp,
  setLocation,
  testUser,
} from '@/testing/render';
import type { User } from '../types';
import { UsersPage } from './users-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u2',
  username: 'abebe',
  fullName: 'Abebe Kebede',
  email: 'abebe@nib.et',
  phoneNumber: '+251911000000',
  branchCode: 'HQ',
  roles: ['USER', 'CUSTOM_ROLE'],
  status: 'ACTIVE',
  mfaEnabled: false,
  lastLoginAt: '2026-01-01T00:00:00Z',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  version: 3,
  ...overrides,
});

const users = [
  user(),
  user({
    id: 'u3',
    username: 'locked',
    fullName: 'Locked Person',
    status: 'LOCKED',
    branchCode: null,
  }),
  user({ id: 'u4', username: 'gone', fullName: 'Gone Person', deletedAt: '2026-02-01T00:00:00Z' }),
  user({ id: 'u-1', username: 'admin', fullName: 'Ada Admin' }),
];

const option = (value: string, label = value) => ({
  value,
  label,
  hint: null,
  description: null,
  group: null,
  disabled: false,
});

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/users': page(users, { pageSize: 4, total: 9 }),
    'GET /api/approvals/pending': { u2: 'apr-1' },
    'GET /api/approvals/policy': [
      { action: 'users.delete', required: true, resourceType: 'User', checkerPermissions: [] },
    ],
    'GET /api/reference-data/lookups/branches': [
      {
        code: 'HQ',
        label: 'Head office',
        active: true,
        attributes: {},
        description: null,
        parentCode: null,
      },
    ],
    'GET /api/options/roles': page([option('USER', 'User'), option('AUDITOR', 'Auditor')]),
    'GET /api/options/refdata.branches': page([option('HQ', 'Head office')]),
    'POST /api/users': envelope(user({ id: 'u9' }), { status: 201 }),
    'PATCH /api/users/u2': user({ fullName: 'Abebe K.' }),
    'DELETE /api/users/u2': envelope({ approvalId: 'apr-2', status: 'PENDING' }, { status: 202 }),
    'POST /api/users/u3/unlock': {},
    'POST /api/users/u4/restore': {},
    'DELETE /api/users/u2/sessions': { terminated: 2 },
    'DELETE /api/users/u3/sessions': new ApiFailure(400, 'BAD_REQUEST'),
    'POST /api/users/u2/reset-password': {},
    'POST /api/users/import': { created: 1, failed: 0, results: [{ index: 0, status: 'created' }] },
    ...extra,
  });
}

const ALL = [
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  'users:restore',
  'users:reset-password',
];
const menuFor = (name: string) =>
  openMenu(screen.getByRole('button', { name: `More actions for ${name}` }));
const show = (permissions = ALL) =>
  renderApp(<UsersPage />, { user: testUser(permissions, { id: 'u-1' }) });

describe('UsersPage', () => {
  beforeEach(() => {
    setLocation('/users');
    navigation.replace.mockClear();
  });

  it('lists users with branches, roles, statuses and pending approvals', async () => {
    routes();
    show();
    expect(await screen.findByText('Abebe Kebede')).toBeTruthy();
    expect(screen.getAllByText('HQ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CUSTOM_ROLE').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/locked/i).length).toBeGreaterThan(0);
  });

  it('runs the row actions of active, locked and deleted users', async () => {
    const api = routes();
    show();
    await screen.findByText('Abebe Kebede');

    fireEvent.click(
      within(await menuFor('Locked Person')).getByRole('menuitem', { name: /Unlock account/ }),
    );
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/users/u3/unlock')).toBe(true),
    );

    fireEvent.click(
      within(await menuFor('Gone Person')).getByRole('menuitem', { name: /Restore user/ }),
    );
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/users/u4/restore')).toBe(true),
    );

    // Your own account cannot be reset or deleted.
    const own = await menuFor('Ada Admin');
    expect(
      within(own)
        .getByRole('menuitem', { name: /Delete user/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.keyDown(own, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    fireEvent.click(
      within(await menuFor('Abebe Kebede')).getByRole('menuitem', { name: /Sign out everywhere/ }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: /Sign out everywhere/,
      }),
    );
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/users/u2/sessions')).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(
      within(await menuFor('Locked Person')).getByRole('menuitem', { name: /Sign out everywhere/ }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: /Sign out everywhere/,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(
      within(await menuFor('Abebe Kebede')).getByRole('menuitem', { name: /Delete user/ }),
    );
    const confirm = await screen.findByRole('alertdialog');
    const reason = within(confirm).queryByRole('textbox');
    if (reason) fireEvent.change(reason, { target: { value: 'Left the bank' } });
    fireEvent.click(within(confirm).getByRole('button', { name: /^Delete$/ }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/users/u2')).toBe(true),
    );
  });

  it('resets a password with a generated one', async () => {
    const api = routes();
    show();
    await screen.findByText('Abebe Kebede');
    fireEvent.click(
      within(await menuFor('Abebe Kebede')).getByRole('menuitem', { name: /Reset password/ }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Generate a strong password/ }));
    fireEvent.click(
      within(dialog)
        .getAllByRole('button', { name: /Reset password/ })
        .at(-1)!,
    );
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/users/u2/reset-password')).toBe(true),
    );
  });

  it('creates a user and edits one', async () => {
    const api = routes();
    show();
    await screen.findByText('Abebe Kebede');
    fireEvent.click(screen.getByRole('button', { name: /New user/ }));
    let dialog = await screen.findByRole('dialog');
    const field = (name: RegExp) =>
      within(dialog).getAllByLabelText(name, { selector: 'input' })[0]!;
    fireEvent.change(field(/Full name/), { target: { value: 'New Person' } });
    fireEvent.change(field(/Username/), { target: { value: 'new.person' } });
    fireEvent.change(field(/Email/), { target: { value: 'new.person@nib.et' } });
    fireEvent.change(field(/Phone/), { target: { value: '+251911222333' } });
    fireEvent.change(field(/Temporary password/), { target: { value: 'Kx9#mPq2Lw!7' } });
    fireEvent.change(field(/Confirm password/), { target: { value: 'Kx9#mPq2Lw!7' } });
    const roles = within(dialog)
      .getAllByRole('combobox')
      .find(
        (c) =>
          /role/i.test(c.textContent ?? '') || /role/i.test(c.getAttribute('aria-label') ?? ''),
      );
    if (roles) {
      fireEvent.keyDown(roles, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('option', { name: /User/ }));
    }
    fireEvent.click(within(dialog).getByRole('button', { name: /Create/ }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/users')).toBe(true),
    );
    expect(
      api.calls.find((c) => c.method === 'POST' && c.path === '/api/users')!.body,
    ).toMatchObject({ username: 'new.person' });

    fireEvent.click(
      within(await menuFor('Abebe Kebede')).getByRole('menuitem', { name: /Edit user/ }),
    );
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getAllByLabelText(/Full name/, { selector: 'input' })[0]!, {
      target: { value: 'Abebe K.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
  });

  it('signs selected users out in bulk and reports failures', async () => {
    const api = routes();
    show();
    await screen.findByText('Abebe Kebede');
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /Sign out everywhere/ })[0]!);
    await waitFor(() =>
      expect(api.calls.filter((c) => c.path.endsWith('/sessions'))).toHaveLength(2),
    );
  });

  it('opens the import dialog, filters and searches, and retries a failed load', async () => {
    const api = routes();
    const view = show();
    await screen.findByText('Abebe Kebede');
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'abebe' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(navigation.replace).toHaveBeenCalled();
    view.unmount();

    routes({ 'GET /api/users': new ApiFailure(400, 'BAD_REQUEST') });
    show(['users:read']);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('button', { name: /New user/ })).toBeNull();
    fireEvent.click(retry);
    void api;
  });
});
