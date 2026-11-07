import { unique, useApi, type ApiClient } from './support/api.js';

// User and role administration, and the maker–checker flow that guards role
// changes and user deletion: admin makes, useradmin checks (and vice versa).

const api = useApi();
const PASSWORD = 'Kx9#mPq2Lw!7';

interface User {
  id: string;
  username: string;
  version: number;
  status: string;
  roles: string[];
  deletedAt: string | null;
}
interface Role {
  id: string;
  code: string;
  version: number;
  permissions: string[];
}
interface Ticket {
  approvalId: string;
  status: 'PENDING';
}
interface Approval {
  id: string;
  status: string;
  canDecide: boolean;
  canCancel: boolean;
}

let admin: ApiClient;
let checker: ApiClient;
let auditor: ApiClient;

beforeAll(async () => {
  admin = await api.as('admin');
  checker = await api.as('useradmin');
  auditor = await api.as('auditor');
});

const idempotent = () => ({ 'idempotency-key': crypto.randomUUID() });

async function createUser(overrides: Record<string, unknown> = {}) {
  const username = unique('usr.');
  const reply = await admin.post<User>(
    '/api/v1/users',
    {
      username,
      email: `${username}@example.com`,
      fullName: 'Managed User',
      phoneNumber: '+251911000111',
      branchCode: 'HQ',
      password: PASSWORD,
      roles: ['USER'],
      ...overrides,
    },
    idempotent(),
  );
  expect(reply.status).toBe(201);
  return reply.body.data;
}

describe('users', () => {
  it('lists, searches, filters, sorts and pages users', async () => {
    const all = await admin.get<User[]>('/api/v1/users?page=1&pageSize=5&sort=-createdAt');
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(5);
    expect(all.body.meta?.pagination?.totalItems).toBeGreaterThan(5);

    const filtered = await admin.get<User[]>(
      '/api/v1/users?search=admin&filter[status]=in:ACTIVE,LOCKED&filter[mfaEnabled]=false&sort=username:asc',
    );
    expect(filtered.status).toBe(200);

    const bad = await admin.get('/api/v1/users?sort=passwordHash');
    expect(bad.status).toBe(400);
    expect((await auditor.post('/api/v1/users', {}, idempotent())).status).toBe(403);
  });

  it('creates a user once per idempotency key and refuses duplicates', async () => {
    const username = unique('idem.');
    const body = {
      username,
      email: `${username}@example.com`,
      fullName: 'Idempotent User',
      password: PASSWORD,
      roles: ['USER'],
    };
    const key = { 'idempotency-key': crypto.randomUUID() };
    const first = await admin.post<User>('/api/v1/users', body, key);
    const replay = await admin.post<User>('/api/v1/users', body, key);
    expect(first.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);

    const missingKey = await admin.post('/api/v1/users', body);
    expect(missingKey.status).toBe(400);
    const duplicate = await admin.post('/api/v1/users', body, idempotent());
    expect(duplicate.status).toBe(409);
    const invalid = await admin.post('/api/v1/users', { ...body, username: 'X' }, idempotent());
    expect(invalid.status).toBe(400);
  });

  it('views, updates, locks, resets and signs a user out', async () => {
    const user = await createUser();
    const viewed = await admin.get<User>(`/api/v1/users/${user.id}`);
    expect(viewed.body.data.username).toBe(user.username);
    expect((await admin.get(`/api/v1/users/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await admin.get('/api/v1/users/not-a-uuid')).status).toBe(400);

    const updated = await admin.patch<User>(`/api/v1/users/${user.id}`, {
      version: user.version,
      fullName: 'Updated User',
      roles: ['USER', 'AUDITOR'],
      status: 'LOCKED',
      branchCode: null,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe('LOCKED');
    const stale = await admin.patch(`/api/v1/users/${user.id}`, {
      version: user.version,
      fullName: 'Stale',
    });
    expect(stale.status).toBe(409);

    expect((await admin.post(`/api/v1/users/${user.id}/unlock`)).status).toBeLessThan(300);
    const reset = await admin.post(`/api/v1/users/${user.id}/reset-password`, {
      newPassword: 'Zt4$rNb8Vq@3',
    });
    expect(reset.status).toBeLessThan(300);
    const terminated = await admin.post<{ terminated: number }>(
      `/api/v1/users/${user.id}/sessions/terminate`,
    );
    expect(terminated.status).toBeLessThan(300);
  });

  it('deletes a user through four-eyes approval, then restores it', async () => {
    const user = await createUser();
    const requested = await admin.delete<Ticket>(
      `/api/v1/users/${user.id}?version=${user.version}`,
      undefined,
      {
        'x-change-reason': 'Left the bank',
      },
    );
    expect(requested.status).toBe(202);
    const { approvalId } = requested.body.data;

    // The maker cannot decide their own request.
    expect((await admin.post(`/api/v1/approvals/${approvalId}/approve`, {})).status).toBe(403);
    const pending = await admin.get<Record<string, string>>(
      `/api/v1/approvals/pending?resourceType=User&ids=${user.id}`,
    );
    expect(pending.body.data[user.id]).toBe(approvalId);

    const approved = await checker.post<Approval>(`/api/v1/approvals/${approvalId}/approve`, {
      comment: 'Confirmed with HR',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
    // Deleted users are no longer served.
    expect((await admin.get(`/api/v1/users/${user.id}`)).status).toBe(404);

    const restored = await admin.post<User>(`/api/v1/users/${user.id}/restore`);
    expect(restored.status).toBeLessThan(300);
    expect((await checker.post(`/api/v1/approvals/${approvalId}/approve`, {})).status).toBe(409);
  });
});

describe('roles and approvals', () => {
  const create = async () => {
    const code = unique('ROLE_')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
    const requested = await admin.post<Ticket>(
      '/api/v1/roles',
      {
        code,
        name: `Role ${code}`,
        description: 'Created by the API tests',
        permissions: ['users:read'],
      },
      { 'x-change-reason': 'New team' },
    );
    expect(requested.status).toBe(202);
    const approved = await checker.post<Approval>(
      `/api/v1/approvals/${requested.body.data.approvalId}/approve`,
      {},
    );
    expect(approved.body.data.status).toBe('APPROVED');
    const found = await admin.get<Role[]>(`/api/v1/roles?search=${code}`);
    return found.body.data.find((r) => r.code === code)!;
  };

  it('lists roles, reads one and the permission catalogue', async () => {
    const roles = await admin.get<Role[]>('/api/v1/roles?sort=name:asc&filter[isSystem]=true');
    expect(roles.status).toBe(200);
    expect(roles.body.data.length).toBeGreaterThan(0);
    const one = await admin.get<Role>(`/api/v1/roles/${roles.body.data[0]!.id}`);
    expect(one.status).toBe(200);
    expect((await admin.get(`/api/v1/roles/${crypto.randomUUID()}`)).status).toBe(404);
    const catalogue = await admin.get<Array<{ code: string }>>('/api/v1/permissions');
    expect(catalogue.body.data.map((p) => p.code)).toContain('users:read');
  });

  it('creates a role after approval, rejects an update, and lets the maker withdraw a delete', async () => {
    const role = await create();
    expect(role.permissions).toEqual(['users:read']);

    const update = await admin.patch<Ticket>(`/api/v1/roles/${role.id}`, {
      version: role.version,
      name: 'Renamed role',
      permissions: ['users:read', 'audit:read'],
    });
    expect(update.status).toBe(202);
    const tooShort = await checker.post(`/api/v1/approvals/${update.body.data.approvalId}/reject`, {
      comment: 'x',
    });
    expect(tooShort.status).toBe(400);
    const rejected = await checker.post<Approval>(
      `/api/v1/approvals/${update.body.data.approvalId}/reject`,
      { comment: 'Too broad' },
    );
    expect(rejected.body.data.status).toBe('REJECTED');

    const removal = await admin.delete<Ticket>(`/api/v1/roles/${role.id}?version=${role.version}`);
    expect(removal.status).toBe(202);
    const second = await admin.delete(`/api/v1/roles/${role.id}?version=${role.version}`);
    expect(second.status).toBe(409);
    // Only the maker may withdraw.
    expect(
      (await checker.post(`/api/v1/approvals/${removal.body.data.approvalId}/cancel`)).status,
    ).toBe(422);
    const cancelled = await admin.post<Approval>(
      `/api/v1/approvals/${removal.body.data.approvalId}/cancel`,
    );
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });

  it('deletes a role after approval, and refuses deleting a role in use', async () => {
    const role = await create();
    const removal = await admin.delete<Ticket>(`/api/v1/roles/${role.id}?version=${role.version}`);
    const approved = await checker.post<Approval>(
      `/api/v1/approvals/${removal.body.data.approvalId}/approve`,
      {},
    );
    expect(approved.body.data.status).toBe('APPROVED');
    expect((await admin.get(`/api/v1/roles/${role.id}`)).status).toBe(404);

    const system = (await admin.get<Role[]>('/api/v1/roles?filter[isSystem]=true')).body.data[0]!;
    const refused = await admin.delete(`/api/v1/roles/${system.id}?version=${system.version}`);
    expect(refused.status).toBeGreaterThanOrEqual(400);
  });

  it('shows each box of the approvals workspace, a request and the policy', async () => {
    for (const box of ['inbox', 'mine', 'history', 'all']) {
      const reply = await admin.get<Approval[]>(
        `/api/v1/approvals?box=${box}&status=PENDING,APPROVED,REJECTED&search=role&page=1&pageSize=10`,
      );
      expect(reply.status).toBe(200);
    }
    const mine = await admin.get<Approval[]>('/api/v1/approvals?box=mine');
    const request = await checker.get<Approval>(`/api/v1/approvals/${mine.body.data[0]!.id}`);
    expect(request.status).toBe(200);
    expect((await admin.get(`/api/v1/approvals/${crypto.randomUUID()}`)).status).toBe(404);

    const summary = await checker.get<{ inbox: number; mine: number }>('/api/v1/approvals/summary');
    expect(summary.body.data).toEqual({ inbox: expect.any(Number), mine: expect.any(Number) });
    const policy = await admin.get<Array<{ action: string; required: boolean }>>(
      '/api/v1/approvals/policy',
    );
    expect(policy.body.data.find((p) => p.action === 'roles.create')?.required).toBe(true);
    expect((await admin.get('/api/v1/approvals?box=nope')).status).toBe(400);
  });
});
