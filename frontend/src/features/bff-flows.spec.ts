import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bff, invoke, signedIn, withCsrf } from '@/testing/bff';

vi.mock('server-only', () => ({}));
vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('next/headers', async () => (await import('@/testing/bff')).nextHeadersModule());
vi.mock('@/infrastructure/config/env', async () => (await import('@/testing/bff')).envModule());
vi.mock('@/infrastructure/api/backend', async () =>
  (await import('@/testing/bff')).backendModule(),
);
vi.mock('next-intl/server', () => ({
  getRequestConfig: (factory: unknown) => factory,
  getLocale: () => Promise.resolve('en'),
  getTranslations: () => Promise.resolve((key: string) => key),
}));
const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('@/features/auth/api/auth.config', () => ({ ...auth, auth: vi.fn() }));
const pending = vi.hoisted(() => ({ value: null as { changeToken: string } | null, cleared: 0 }));
vi.mock('@/features/auth/api/password-change', () => ({
  getPendingPasswordChange: () => Promise.resolve(pending.value),
  clearPendingPasswordChange: () => Promise.resolve(void pending.cleared++),
}));

const {
  login,
  verifyMfa,
  completePasswordChange,
  forgotPassword,
  resetPassword,
  passwordPolicy,
  logout,
} = await import('./auth/api/auth.routes');
const { exportUsers, importUsers } = await import('./users/api/users.routes');
const { quickSearch: search } = await import('./quick-search/api/search.routes');
const { needsRefresh, refreshSession } = await import('./auth/api/session-refresh');
const { AuthError } = await import('next-auth');

const user = (i: number) => ({
  id: `u${i}`,
  username: `user${i}`,
  fullName: `User ${i}`,
  email: `user${i}@nib.et`,
  phoneNumber: null,
  branchCode: 'HQ',
  roles: ['USER'],
  status: 'ACTIVE',
  mfaEnabled: i % 2 === 0,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
});

beforeEach(() => {
  bff.reset();
  auth.signIn.mockReset();
  pending.value = null;
});

describe('sign-in routes', () => {
  const post = (handler: Parameters<typeof invoke>[0], body: unknown, ip = crypto.randomUUID()) => {
    withCsrf();
    bff.header('x-real-ip', ip);
    return invoke(handler, { method: 'POST', body });
  };

  it('signs in and maps each Auth.js outcome', async () => {
    auth.signIn.mockResolvedValueOnce(undefined);
    let res = await post(login, { username: 'ada', password: 'x', callbackUrl: '/users' });
    expect(res.json!.data).toEqual({ status: 'AUTHENTICATED', redirectTo: '/users' });

    auth.signIn.mockResolvedValueOnce('/login?error=CredentialsSignin&code=mfa_required');
    res = await post(login, { username: 'ada', password: 'x', callbackUrl: '/roles' });
    expect(res.json!.data).toEqual({
      status: 'MFA_REQUIRED',
      redirectTo: '/login/mfa?callbackUrl=%2Froles',
    });

    auth.signIn.mockRejectedValueOnce(
      Object.assign(new AuthError('x'), { code: 'password_change_required' }),
    );
    res = await post(login, { username: 'ada', password: 'x' });
    expect(res.json!.data.status).toBe('PASSWORD_CHANGE_REQUIRED');

    auth.signIn.mockRejectedValueOnce(
      Object.assign(new AuthError('x'), { code: 'account_locked' }),
    );
    res = await post(login, { username: 'ada', password: 'x' });
    expect(res.status).toBe(423);

    auth.signIn.mockResolvedValueOnce('/login?error=CredentialsSignin');
    expect((await post(login, { username: 'ada', password: 'x' })).status).toBe(401);
    auth.signIn.mockRejectedValueOnce(new Error('boom'));
    expect((await post(login, { username: 'ada', password: 'x' })).status).toBe(500);
    expect((await post(login, { username: '' })).status).toBe(400);
    expect((await post(login, 'not json')).status).toBe(400);
  });

  it('rate-limits sign-in attempts per address', async () => {
    auth.signIn.mockResolvedValue(undefined);
    const ip = crypto.randomUUID();
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (await post(login, { username: 'ada', password: 'x' }, ip)).status;
    expect(last).toBe(429);
    for (let i = 0; i < 11; i++) last = (await post(verifyMfa, { code: '123456' }, ip)).status;
    expect(last).toBe(429);
  });

  it('verifies the second factor', async () => {
    auth.signIn.mockResolvedValueOnce(undefined);
    expect(
      (await post(verifyMfa, { code: '123456', callbackUrl: '/dashboard' })).json!.data.status,
    ).toBe('AUTHENTICATED');
    expect((await post(verifyMfa, { code: 'abc' })).json!.error.code).toBe('mfa_invalid');
  });

  it('completes a required password change and hands the session to Auth.js', async () => {
    expect(
      (await post(completePasswordChange, { newPassword: 'Kx9#mPq2Lw!7' })).json!.error.code,
    ).toBe('password_change_expired');

    pending.value = { changeToken: 'ct-1' };
    bff.reply('POST /auth/password/change', { data: { status: 'AUTHENTICATED' } });
    auth.signIn.mockResolvedValueOnce(undefined);
    const ok = await post(completePasswordChange, {
      newPassword: 'Kx9#mPq2Lw!7',
      callbackUrl: '/users',
    });
    expect(ok.json!.data.status).toBe('AUTHENTICATED');
    expect(bff.calls[0]!.body).toEqual({ changeToken: 'ct-1', newPassword: 'Kx9#mPq2Lw!7' });

    bff.reply('POST /auth/password/change', bff.error(401, 'AUTH_PASSWORD_CHANGE_INVALID'));
    expect(
      (await post(completePasswordChange, { newPassword: 'Kx9#mPq2Lw!7' })).json!.error.code,
    ).toBe('password_change_expired');
    bff.reply(
      'POST /auth/password/change',
      bff.error(400, 'VALIDATION_FAILED', [{ field: 'newPassword', message: 'too short' }]),
    );
    const invalid = await post(completePasswordChange, { newPassword: 'short' });
    expect(invalid.json!.error.details).toEqual([{ field: 'newPassword', message: 'too short' }]);
    expect((await post(completePasswordChange, {})).status).toBe(400);
  });

  it('requests and completes a password reset, and serves the policy', async () => {
    expect((await post(forgotPassword, { identifier: 'ada' })).status).toBe(200);
    expect(bff.calls.at(-1)).toMatchObject({
      path: '/auth/password/forgot',
      body: { identifier: 'ada' },
    });
    expect((await post(forgotPassword, { identifier: '' })).status).toBe(400);
    expect(
      (await post(resetPassword, { token: 't'.repeat(30), newPassword: 'Kx9#mPq2Lw!7' })).status,
    ).toBe(200);
    expect((await post(resetPassword, { token: 'short' })).status).toBe(400);

    bff.reply('GET /auth/password-policy', { data: { minLength: 10 } });
    expect((await invoke(passwordPolicy)).json!.data).toEqual({ minLength: 10 });
  });

  it('signs out, keeping the reason', async () => {
    expect((await post(logout, { reason: 'idle' })).json!.data.redirectTo).toBe(
      '/login?reason=idle',
    );
    expect((await post(logout, 'not json')).json!.data.redirectTo).toBe('/login?reason=signed_out');
    expect(auth.signOut).toHaveBeenCalled();
  });
});

describe('export and import', () => {
  it('exports every page as CSV, only chosen columns, and as XLSX', async () => {
    await signedIn(['users:read'], {
      user: { ...(await signedIn()).user, id: crypto.randomUUID() },
    });
    bff.reply('GET /users', ({ query }) => {
      const page = Number(
        new URLSearchParams(
          String(
            query instanceof URLSearchParams
              ? query
              : new URLSearchParams(query as Record<string, string>),
          ),
        ).get('page') ?? 1,
      );
      return {
        data: [user(page * 2 - 1), user(page * 2)],
        meta: { pagination: { page, pageSize: 2, totalItems: 6, totalPages: 3 } },
      };
    });
    const csv = await invoke(exportUsers, {
      url: '/api/users/export?format=csv&columns=fullName,email,status,mfaEnabled',
    });
    expect(csv.status).toBe(200);
    const text = await csv.res.text();
    expect(text).toContain('User 6');
    expect(csv.res.headers.get('x-export-rows')).toBe('6');

    const xlsx = await invoke(exportUsers, { url: '/api/users/export?format=xlsx' });
    expect(xlsx.res.headers.get('content-type')).toContain('spreadsheetml');
    expect((await xlsx.res.arrayBuffer()).byteLength).toBeGreaterThan(100);

    expect((await invoke(exportUsers, { url: '/api/users/export?format=pdf' })).status).toBe(400);
    expect((await invoke(exportUsers, { url: '/api/users/export?columns=nope' })).status).toBe(400);
  });

  it('fails the stream when a later page fails, and rate-limits exports', async () => {
    const session = await signedIn(['users:read'], {
      user: { ...(await signedIn()).user, id: crypto.randomUUID() },
    });
    bff.reply('GET /users', ({ query }) => {
      const page = String(
        (query as Record<string, unknown>)?.page ?? new URLSearchParams(query as never).get('page'),
      );
      return page === '1'
        ? {
            data: [user(1)],
            meta: { pagination: { page: 1, pageSize: 1, totalItems: 2, totalPages: 2 } },
          }
        : bff.error(503, 'SERVICE_UNAVAILABLE');
    });
    const res = await invoke(exportUsers, { url: '/api/users/export' });
    await expect(res.res.text()).rejects.toBeTruthy();
    let last = 0;
    for (let i = 0; i < 10; i++)
      last = (await invoke(exportUsers, { url: '/api/users/export' })).status;
    expect(last).toBe(429);
    void session;
  });

  it('imports valid rows idempotently and reports per-row failures', async () => {
    await signedIn(['users:create'], {
      user: { ...(await signedIn()).user, id: crypto.randomUUID() },
    });
    let n = 0;
    bff.reply('POST /users', () =>
      ++n === 2 ? bff.error(409, 'CONFLICT') : { data: { id: `new-${n}` }, status: 201 },
    );
    const batchId = crypto.randomUUID();
    const rows = [
      { username: 'abebe.k', fullName: 'Abebe K', email: 'abebe@nib.et', roles: 'USER' },
      { username: 'selam.t', fullName: 'Selam T', email: 'selam@nib.et', roles: 'USER;AUDITOR' },
      { username: 'X', fullName: '', email: 'bad', roles: '' },
    ];
    const res = await invoke(importUsers, { method: 'POST', body: { batchId, rows } });
    expect(res.status).toBe(200);
    expect(res.json!.data.created).toBe(1);
    expect(res.json!.data.failed).toBe(2);
    expect(bff.calls.filter((c) => c.method === 'POST').map((c) => c.idempotencyKey)).toEqual(
      expect.arrayContaining([`${batchId}:0`, `${batchId}:1`]),
    );
    expect(
      (await invoke(importUsers, { method: 'POST', body: { batchId: 'nope', rows: [] } })).status,
    ).toBe(400);
  });
});

describe('quick search', () => {
  it('searches every source the user may read, isolating failures', async () => {
    await signedIn(['*']);
    bff.reply('GET /users', { data: [user(1)] });
    bff.reply('GET /roles', { data: [{ id: 'r1', name: 'Auditor', code: 'AUDITOR' }] });
    bff.reply('GET /reference-data/types', bff.error(503, 'SERVICE_UNAVAILABLE'));
    bff.reply('GET /approvals', {
      data: [{ id: 'a1', summary: 'Update role', action: 'roles.update', status: 'PENDING' }],
    });
    bff.reply('GET /audit-logs', {
      data: [
        {
          id: 'e1',
          action: 'USER_UPDATE',
          actorUsername: 'ada',
          resourceType: 'User',
          occurredAt: '2026-01-01T10:00:00Z',
          outcome: 'SUCCESS',
        },
      ],
    });
    const uuid = crypto.randomUUID();
    const res = await invoke(search, { url: `/api/search?q=${uuid}` });
    expect(res.json!.data.failed).toEqual(['reference-data']);
    expect(res.json!.data.records.map((r: { source: string }) => r.source)).toEqual(
      expect.arrayContaining(['users', 'roles', 'approvals', 'audit']),
    );
    const short = await invoke(search, { url: '/api/search?q=a' });
    expect(short.json!.data.records).toEqual([]);
  });

  it('only searches the sources the user may read', async () => {
    await signedIn(['roles:read']);
    bff.reply('GET /roles', { data: [] });
    await invoke(search, { url: '/api/search?q=teller' });
    expect(bff.calls.map((c) => c.path)).toEqual(['/roles']);
  });
});

describe('session refresh', () => {
  const data = (refreshToken: string) =>
    ({
      user: { id: 'u1' },
      accessToken: 'old',
      accessTokenExpiresAt: Date.now() + 10_000,
      refreshToken,
      refreshTokenExpiresAt: Date.now() + 3_600_000,
      backendSessionId: 's1',
      lastActivity: Date.now(),
      idleTimeoutSeconds: 1800,
    }) as never;

  it('knows when a token needs refreshing', () => {
    expect(needsRefresh(data('r'), 60)).toBe(true);
    expect(needsRefresh(data('r'), 5)).toBe(false);
  });

  it('refreshes the tokens and the profile once per refresh token', async () => {
    bff.reply('POST /auth/token/refresh', {
      data: {
        accessToken: 'new',
        accessTokenExpiresAt: '2099-01-01T00:00:00Z',
        refreshToken: 'r2',
        refreshTokenExpiresAt: '2099-01-02T00:00:00Z',
      },
    });
    bff.reply('GET /auth/me', {
      data: {
        id: 'u1',
        username: 'ada',
        fullName: 'Ada',
        email: 'a@b.c',
        roles: [],
        permissions: ['users:read'],
        branchCode: null,
        mfaEnabled: false,
      },
    });
    const token = crypto.randomUUID();
    const [a, b] = await Promise.all([
      refreshSession(data(token), {}),
      refreshSession(data(token), {}),
    ]);
    expect(a).toBe(b);
    expect(a!.accessToken).toBe('new');
    expect(a!.user.permissions).toEqual(['users:read']);
    expect(bff.calls.filter((c) => c.path === '/auth/token/refresh')).toHaveLength(1);
  });

  it('ends the session when the backend rejects the refresh token, and rethrows transient failures', async () => {
    bff.reply('POST /auth/token/refresh', bff.error(401, 'AUTH_REFRESH_TOKEN_REUSED'));
    expect(await refreshSession(data(crypto.randomUUID()), {})).toBeNull();
    bff.reply('POST /auth/token/refresh', bff.error(503, 'SERVICE_UNAVAILABLE'));
    await expect(refreshSession(data(crypto.randomUUID()), {})).rejects.toBeTruthy();
  });
});
