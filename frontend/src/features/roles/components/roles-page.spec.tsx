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
} from '@/testing/render';
import type { Role } from '../types';
import { RoleFormDialog } from './role-form-dialog';
import { RolesPage } from './roles-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const role = (overrides: Partial<Role> = {}): Role => ({
  id: 'r1',
  code: 'TELLER',
  name: 'Teller',
  description: 'Front office',
  permissions: ['users:read', 'audit:read'],
  isSystem: false,
  userCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 2,
  ...overrides,
});

const roles = [
  role(),
  role({
    id: 'r2',
    code: 'ADMIN',
    name: 'Administrator',
    description: null,
    permissions: ['*'],
    isSystem: true,
    userCount: 3,
  }),
  role({ id: 'r3', code: 'EMPTY', name: 'Empty', permissions: [], userCount: 2 }),
];

const catalogue = [
  { code: 'users:read', description: 'Read users' },
  { code: 'users:create', description: 'Create users' },
  { code: 'audit:read', description: 'Read the audit log' },
  { code: 'roles:read', description: null },
];

const ALL = ['roles:read', 'roles:create', 'roles:update', 'roles:delete'];

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/roles': page(roles),
    'GET /api/permissions': catalogue,
    'GET /api/approvals/pending': { r1: 'apr-9' },
    'GET /api/approvals/policy': [],
    'POST /api/roles': envelope(role({ id: 'r9', code: 'NEW_ROLE' }), { status: 201 }),
    'PATCH /api/roles/r1': role({ name: 'Teller II' }),
    'DELETE /api/roles/r1': role(),
    ...extra,
  });
}

const menuFor = (name: string) =>
  openMenu(screen.getByRole('button', { name: `Actions for ${name}` }));

describe('RolesPage', () => {
  beforeEach(() => {
    setLocation('/roles');
    navigation.replace.mockClear();
  });

  it('lists roles with their permission counts and pending approvals', async () => {
    routes();
    renderApp(<RolesPage />, { permissions: ALL });
    expect(await screen.findByText('Teller')).toBeTruthy();
    expect(screen.getAllByText('Front office').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/all permissions/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('views, edits, clones and deletes from the row menu', async () => {
    const api = routes();
    renderApp(<RolesPage />, { permissions: ALL });
    await screen.findByText('Teller');

    fireEvent.click(
      within(await menuFor('Teller')).getByRole('menuitem', { name: /View details/ }),
    );
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(within(await menuFor('Teller')).getByRole('menuitem', { name: /Edit role/ }));
    expect(await screen.findByText('Edit Teller')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Edit Teller')).toBeNull());

    fireEvent.click(within(await menuFor('Teller')).getByRole('menuitem', { name: /Clone role/ }));
    expect(await screen.findByDisplayValue('TELLER_COPY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // System and in-use roles cannot be deleted.
    const adminMenu = await menuFor('Administrator');
    expect(
      within(adminMenu)
        .getByRole('menuitem', { name: /Delete role/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.keyDown(adminMenu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    fireEvent.click(within(await menuFor('Teller')).getByRole('menuitem', { name: /Delete role/ }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('closes the delete dialog when the delete fails', async () => {
    routes({ 'DELETE /api/roles/r1': new ApiFailure(409, 'CONFLICT') });
    renderApp(<RolesPage />, { permissions: ALL });
    await screen.findByText('Teller');
    fireEvent.click(within(await menuFor('Teller')).getByRole('menuitem', { name: /Delete role/ }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete role' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('opens the detail dialog from a row and acts from it', async () => {
    routes();
    renderApp(<RolesPage />, { permissions: ALL });
    fireEvent.click(await screen.findByText('Teller'));
    const dialog = await screen.findByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    const edit = buttons.find((b) => /edit/i.test(b.textContent ?? ''));
    expect(edit).toBeTruthy();
    fireEvent.click(edit!);
    expect(await screen.findByText('Edit Teller')).toBeTruthy();
  });

  it('expands a row to show its permissions', async () => {
    routes();
    renderApp(<RolesPage />, { permissions: ALL });
    await screen.findByText('Teller');
    const expanders = screen.getAllByRole('button', { name: /expand|details|show/i });
    fireEvent.click(expanders[0]!);
    expect(await screen.findAllByText(/users:read|Read users/)).toBeTruthy();
  });

  it('is read-only without role permissions, and retries a failed load', async () => {
    const api = routes({ 'GET /api/roles': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<RolesPage />, { permissions: ['roles:read'] });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('button', { name: /New role/ })).toBeNull();
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });

  it('imports roles from a CSV file', async () => {
    const api = routes({
      'POST /api/roles/import': {
        created: 1,
        failed: 1,
        results: [
          { index: 0, status: 'created', id: 'r9' },
          {
            index: 1,
            status: 'failed',
            error: {
              code: 'CONFLICT',
              message: 'Code taken',
              details: [{ field: 'code', message: 'exists' }],
            },
          },
        ],
      },
    });
    renderApp(<RolesPage />, { permissions: ALL });
    await screen.findByText('Teller');
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Download template/ }));

    const upload = (text: string) => {
      const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [new File([text], 'roles.csv', { type: 'text/csv' })] },
      });
    };

    upload('code,name\n');
    expect(await within(dialog).findByText('The file has no data rows.')).toBeTruthy();
    upload('name,description\nTeller,x\n');
    expect(await within(dialog).findByText(/Required columns are missing: code/)).toBeTruthy();

    upload(
      'Code,Name,Description,Permissions\nBRANCH_TELLER,Branch Teller,,users:read;audit:read\nOPS,Operations,Back office,\nbad code,x,,\n',
    );
    expect(await within(dialog).findByText('3 rows')).toBeTruthy();
    expect(within(dialog).getByText('2 ready')).toBeTruthy();
    expect(within(dialog).getByText('1 with issues')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('switch'));
    expect(within(dialog).queryByText('BRANCH_TELLER')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: /Download error report/ }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 rows' }));
    expect(await within(dialog).findByText('1 record created')).toBeTruthy();
    expect(within(dialog).getByText('1 row failed')).toBeTruthy();
    expect(within(dialog).getByText('Code taken')).toBeTruthy();
    expect(api.calls.find((c) => c.path === '/api/roles/import')!.body).toMatchObject({
      rows: expect.any(Array),
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Download error report/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import another file' }));
    expect(within(dialog).getByRole('button', { name: /Download template/ })).toBeTruthy();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!);
  });

  it('reports a failed import and goes back to the upload step', async () => {
    routes({ 'POST /api/roles/import': new ApiFailure(400, 'BAD_REQUEST', 'Import refused') });
    renderApp(<RolesPage />, { permissions: ALL });
    await screen.findByText('Teller');
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    const dialog = await screen.findByRole('dialog');
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['code,name\nOPS,Operations\n'], 'r.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Import 1 row' }));
    expect(await within(dialog).findByText('Import refused')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));

    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, {
      target: {
        files: [
          new File(['code,name\nOPS,Operations\nOPS2,Operations 2\n'], 'r.csv', {
            type: 'text/csv',
          }),
        ],
      },
    });
    expect(await within(dialog).findByText('2 rows')).toBeTruthy();
  });
});

describe('RoleFormDialog', () => {
  it('creates a role with the chosen permissions', async () => {
    const api = routes();
    const onOpenChange = vi.fn();
    renderApp(<RoleFormDialog open mode="create" role={null} onOpenChange={onOpenChange} />, {
      permissions: ALL,
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'New role' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Code/ }), {
      target: { value: 'new_role' },
    });
    // Grant from each module of the master-detail picker.
    for (const group of await within(dialog).findAllByRole('option')) {
      fireEvent.click(group);
      for (const box of within(dialog).queryAllByRole('checkbox', { name: /:/ }))
        fireEvent.click(box);
    }
    fireEvent.click(within(dialog).getByRole('button', { name: /Role information/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Role information/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/roles')).toBe(true),
    );
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      code: 'NEW_ROLE',
      name: 'New role',
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('validates the code and name', async () => {
    const api = routes();
    renderApp(<RoleFormDialog open mode="create" role={null} onOpenChange={vi.fn()} />, {
      permissions: ALL,
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Code/ }), {
      target: { value: '1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(within(dialog).getAllByRole('alert').length).toBeGreaterThan(0));
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('edits a system super-role without touching its permissions', async () => {
    const api = routes({ 'PATCH /api/roles/r2': roles[1] });
    renderApp(<RoleFormDialog open mode="edit" role={roles[1]!} onOpenChange={vi.fn()} />, {
      permissions: ALL,
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Description/ }), {
      target: { value: 'Everything' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
    const body = api.calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>;
    expect(body).toMatchObject({ version: 2, description: 'Everything' });
    expect(body).not.toHaveProperty('permissions');
  });

  it('edits a custom role with its permissions', async () => {
    const api = routes();
    renderApp(<RoleFormDialog open mode="edit" role={roles[0]!} onOpenChange={vi.fn()} />, {
      permissions: ALL,
    });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findAllByRole('option');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({
      permissions: ['users:read', 'audit:read'],
    });
  });
});
