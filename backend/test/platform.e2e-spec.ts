import { freshIp, unique, useApi, type ApiClient } from './support/api.js';

// Reference data, the audit trail, compliance, notifications, settings, picker
// options and documents: every read and write of the platform modules.

const api = useApi();

let admin: ApiClient;
let checker: ApiClient;
let user: ApiClient;

beforeAll(async () => {
  admin = await api.as('admin');
  checker = await api.as('useradmin');
  user = await api.as('jdoe');
});

describe('reference data', () => {
  interface Type {
    code: string;
    version: number;
    itemCount: number;
  }
  interface Item {
    id: string;
    code: string;
    version: number;
    active: boolean;
  }

  it('manages a list and its items, with lookups for pickers', async () => {
    const code = unique('list-').toLowerCase();
    const created = await admin.post<Type>('/api/v1/reference-data/types', {
      code,
      name: 'Test list',
      description: 'From the API tests',
      attributes: [
        { key: 'symbol', label: 'Symbol', type: 'text', required: true },
        { key: 'rank', label: 'Rank', type: 'number', required: false },
        { key: 'kind', label: 'Kind', type: 'select', required: false, options: ['A', 'B'] },
      ],
    });
    expect(created.status).toBe(201);
    expect((await admin.post('/api/v1/reference-data/types', { code, name: 'Again' })).status).toBe(
      409,
    );

    const type = await admin.get<Type>(`/api/v1/reference-data/types/${code}`);
    expect(type.status).toBe(200);
    const renamed = await admin.patch<Type>(`/api/v1/reference-data/types/${code}`, {
      version: type.body.data.version,
      name: 'Renamed list',
    });
    expect(renamed.status).toBe(200);

    const item = await admin.post<Item | { approvalId: string }>(
      `/api/v1/reference-data/types/${code}/items`,
      {
        code: 'one',
        label: 'One',
        labels: { am: 'አንድ' },
        sortOrder: 1,
        validFrom: '2020-01-01',
        attributes: { symbol: '1', rank: 1, kind: 'A' },
      },
    );
    expect([201, 202]).toContain(item.status);
    const invalid = await admin.post(`/api/v1/reference-data/types/${code}/items`, {
      code: 'two',
      label: 'Two',
      attributes: { rank: 'x', kind: 'Z' },
    });
    expect(invalid.status).toBe(400);

    const items = await admin.get<Item[]>(
      `/api/v1/reference-data/types/${code}/items?sort=sortOrder:asc&search=one&filter[active]=true`,
    );
    expect(items.status).toBe(200);
    const one = items.body.data.find((i) => i.code === 'ONE');
    if (one) {
      const updated = await admin.patch(`/api/v1/reference-data/items/${one.id}`, {
        version: one.version,
        active: false,
        label: 'One (old)',
      });
      expect([200, 202]).toContain(updated.status);
      const lookup = await user.get(
        `/api/v1/reference-data/lookups/${code}?locale=am&includeInactive=true`,
      );
      expect(lookup.status).toBe(200);
      const latest = (await admin.get<Item[]>(`/api/v1/reference-data/types/${code}/items`)).body
        .data[0]!;
      const removed = await admin.delete<{ approvalId?: string }>(
        `/api/v1/reference-data/items/${latest.id}`,
      );
      expect([200, 202]).toContain(removed.status);
      if (removed.status === 202) {
        await checker.post(`/api/v1/approvals/${removed.body.data.approvalId}/approve`, {});
      }
    }

    const lists = await admin.get<Type[]>(
      '/api/v1/reference-data/types?pageSize=100&sort=name:asc',
    );
    expect(lists.body.data.some((t) => t.code === code)).toBe(true);
    const latestType = await admin.get<Type>(`/api/v1/reference-data/types/${code}`);
    const deleted = await admin.delete(
      `/api/v1/reference-data/types/${code}?version=${latestType.body.data.version}`,
    );
    expect(deleted.status).toBeLessThan(500);
    expect((await admin.get('/api/v1/reference-data/types/no-such-list')).status).toBe(404);
    expect(
      (await user.post('/api/v1/reference-data/types', { code: 'x-y', name: 'No' })).status,
    ).toBe(403);
  });

  it('serves lookups of the seeded lists, by parent', async () => {
    const lists = await admin.get<Type[]>('/api/v1/reference-data/types?pageSize=100');
    for (const list of lists.body.data.slice(0, 6)) {
      const lookup = await user.get(`/api/v1/reference-data/lookups/${list.code}`);
      expect(lookup.status).toBe(200);
    }
    expect(
      (await user.get('/api/v1/reference-data/lookups/branches?parent=AA')).status,
    ).toBeLessThan(500);
  });
});

describe('audit trail', () => {
  it('lists, filters, opens and summarises audit records', async () => {
    const list = await admin.get<Array<{ id: string }>>(
      '/api/v1/audit-logs?pageSize=20&sort=occurredAt:desc&filter[outcome]=in:SUCCESS,FAILURE&search=login',
    );
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    const record = await admin.get(`/api/v1/audit-logs/${list.body.data[0]!.id}`);
    expect(record.status).toBe(200);
    expect((await admin.get(`/api/v1/audit-logs/${crypto.randomUUID()}`)).status).toBe(404);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const activity = await admin.get(
      `/api/v1/audit-logs/activity?from=${from}&to=${new Date().toISOString()}`,
    );
    expect(activity.status).toBe(200);
    expect((await admin.get('/api/v1/audit-logs/facets')).status).toBe(200);
    expect((await user.get('/api/v1/audit-logs')).status).toBe(403);
  });
});

describe('compliance', () => {
  it('shows the overview, verifies the chain, anchors it and lists checkpoints', async () => {
    expect((await admin.get('/api/v1/compliance/overview')).status).toBe(200);
    // A failed sign-in is audited without a result; the chain must still verify.
    const failed = await api.call('POST', '/api/v1/auth/login', {
      body: { username: 'jdoe', password: 'Wrong#Pass1' },
      clientIp: freshIp(),
    });
    expect(failed.status).toBe(401);
    const verified = await admin.post<{ status: string }>('/api/v1/compliance/audit/verify');
    expect(verified.status).toBe(200);
    expect(verified.body.data.status).toBe('INTACT');
    expect((await admin.post('/api/v1/compliance/audit/anchor')).status).toBeLessThan(300);
    expect((await admin.get('/api/v1/compliance/audit/checkpoints')).status).toBe(200);
  });

  it('previews and runs retention, and triggers background jobs', async () => {
    expect((await admin.get('/api/v1/compliance/retention/preview')).status).toBe(200);
    const dryRun = await admin.post<{ dryRun: boolean }>('/api/v1/compliance/retention/run', {
      dryRun: true,
    });
    expect(dryRun.status).toBeLessThan(300);
    expect((await admin.get('/api/v1/compliance/retention/runs?page=1&pageSize=5')).status).toBe(
      200,
    );
    for (const job of ['approval-expiry', 'audit-chain-anchor', 'password-expiry-reminder']) {
      expect((await admin.post(`/api/v1/compliance/jobs/${job}/run`)).status).toBeLessThan(300);
    }
    expect((await admin.post('/api/v1/compliance/jobs/no-such-job/run')).status).toBe(404);
    expect((await user.get('/api/v1/compliance/overview')).status).toBe(403);
  });
});

describe('notifications', () => {
  it('broadcasts an announcement and works the inbox', async () => {
    const sent = await admin.post<{ recipients: number }>('/api/v1/notifications/broadcast', {
      audience: 'ALL',
      severity: 'WARNING',
      title: 'Maintenance tonight',
      body: 'The system is unavailable from 22:00.',
      link: '/dashboard',
    });
    expect(sent.status).toBeLessThan(300);
    expect(
      (
        await admin.post('/api/v1/notifications/broadcast', {
          audience: 'ROLES',
          roles: ['AUDITOR'],
          title: 'Audit week',
          body: 'Please review.',
        })
      ).status,
    ).toBeLessThan(300);
    expect(
      (
        await user.post('/api/v1/notifications/broadcast', {
          audience: 'ALL',
          title: 'No',
          body: 'No',
        })
      ).status,
    ).toBe(403);

    const inbox = await user.get<Array<{ id: string }>>(
      '/api/v1/notifications?folder=inbox&page=1&pageSize=10',
    );
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.length).toBeGreaterThan(0);
    const id = inbox.body.data[0]!.id;
    expect((await user.get(`/api/v1/notifications/${id}`)).status).toBe(200);
    expect((await user.get(`/api/v1/notifications/${crypto.randomUUID()}`)).status).toBe(404);

    for (const action of [
      'read',
      'unread',
      'star',
      'unstar',
      'archive',
      'unarchive',
      'trash',
      'restore',
    ]) {
      const reply = await user.post<{ affected: number }>('/api/v1/notifications/actions', {
        action,
        ids: [id],
      });
      expect(reply.status).toBeLessThan(300);
    }
    expect(
      (
        await user.post('/api/v1/notifications/actions', {
          action: 'read',
          folder: 'inbox',
          category: 'ANNOUNCEMENT',
        })
      ).status,
    ).toBeLessThan(300);
    expect(
      (await user.post('/api/v1/notifications/actions', { action: 'trash', ids: [id] })).status,
    ).toBeLessThan(300);
    expect(
      (await user.post('/api/v1/notifications/actions', { action: 'delete', folder: 'trash' }))
        .status,
    ).toBeLessThan(300);

    for (const folder of ['unread', 'starred', 'archived', 'trash', 'all']) {
      expect(
        (
          await user.get(
            `/api/v1/notifications?folder=${folder}&search=maintenance&category=ANNOUNCEMENT`,
          )
        ).status,
      ).toBe(200);
    }
    const summary = await user.get<{ unread: number }>('/api/v1/notifications/summary');
    expect(summary.body.data.unread).toEqual(expect.any(Number));
  });

  it('reads and saves channel preferences', async () => {
    const prefs = await user.get<Array<{ category: string; inApp: boolean; email: boolean }>>(
      '/api/v1/notifications/preferences',
    );
    expect(prefs.status).toBe(200);
    const saved = await user.put('/api/v1/notifications/preferences', {
      preferences: prefs.body.data.map((p) => ({
        category: p.category,
        inApp: p.inApp,
        email: !p.email,
      })),
    });
    expect(saved.status).toBeLessThan(300);
  });
});

describe('settings, options and documents', () => {
  it('reads and changes settings', async () => {
    const settings = await admin.get<{
      definitions: Array<{
        key: string;
        type: string;
        default: unknown;
        options: string[] | null;
        min: number | null;
      }>;
      values: Record<string, unknown>;
    }>('/api/v1/settings');
    expect(settings.status).toBe(200);
    const text = settings.body.data.definitions.find((d) => d.type === 'string');
    if (text) {
      const changed = await admin.patch('/api/v1/settings', {
        values: { [text.key]: 'API test value' },
      });
      expect(changed.status).toBeLessThan(300);
      const restored = await admin.patch('/api/v1/settings', {
        values: { [text.key]: settings.body.data.values[text.key] ?? text.default },
      });
      expect(restored.status).toBeLessThan(500);
    }
    expect((await admin.patch('/api/v1/settings', { values: { 'no.such.key': 1 } })).status).toBe(
      400,
    );
    expect((await user.get('/api/v1/settings/public')).status).toBe(200);
    expect((await user.get('/api/v1/settings')).status).toBe(403);
  });

  it('serves picker options of every source the user may read', async () => {
    const sources =
      await admin.get<Array<{ key: string; requiresVariant: boolean }>>('/api/v1/options');
    expect(sources.status).toBe(200);
    for (const source of sources.body.data) {
      const key = source.requiresVariant ? `${source.key}.branches` : source.key;
      const page = await admin.get(`/api/v1/options/${key}?page=1&pageSize=5&search=a`);
      expect(page.status).toBeLessThan(500);
      expect((await admin.get(`/api/v1/options/${key}?values=x,y`)).status).toBeLessThan(500);
    }
    expect((await admin.get('/api/v1/options/no-such-source')).status).toBe(404);
  });

  it('renders and sends documents', async () => {
    const sources = await admin.get<Array<{ key: string; canSend: boolean }>>('/api/v1/documents');
    expect(sources.status).toBe(200);
    const roles = await admin.get<Array<{ id: string }>>('/api/v1/roles?pageSize=1');
    const users = await admin.get<Array<{ id: string }>>('/api/v1/users?pageSize=1');
    const ids: Record<string, string> = {
      roles: roles.body.data[0]!.id,
      users: users.body.data[0]!.id,
    };
    for (const source of sources.body.data) {
      const id = ids[source.key] ?? crypto.randomUUID();
      const pdf = await admin.raw('GET', `/api/v1/documents/${source.key}/${id}/pdf`);
      expect(pdf.status).toBeLessThan(500);
      if (source.canSend) {
        const sent = await admin.post(`/api/v1/documents/${source.key}/${id}/send`, {
          to: 'reader@example.com',
          toName: 'Reader',
          subject: 'Your document',
          message: 'Attached.',
        });
        expect(sent.status).toBeLessThan(500);
      }
    }
    expect(
      (await admin.raw('GET', `/api/v1/documents/nothing/${crypto.randomUUID()}/pdf`)).status,
    ).toBe(404);
  });
});
