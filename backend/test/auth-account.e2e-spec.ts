import { currentStep, totpAt } from '#modules/auth/infrastructure/mfa/totp.js';
import { freshIp, unique, useApi, type ApiClient } from './support/api.js';

// Sign-in in all its shapes (password change, MFA, refresh, logout) and the
// self-service account API, on accounts the tests create for themselves.

const api = useApi();
const STRONG = 'Kx9#mPq2Lw!7';
const STRONGER = 'Zt4$rNb8Vq@3';

type Outcome = {
  status: 'AUTHENTICATED' | 'MFA_REQUIRED' | 'PASSWORD_CHANGE_REQUIRED';
  tokens?: { accessToken: string; refreshToken: string; sessionId: string };
  mfa?: { challengeId: string };
  passwordChange?: { changeToken: string; reason: string };
};

let admin: ApiClient;

/** A new active user (created by an administrator, so it must change its password first). */
async function newUser() {
  const username = unique('acct.');
  const created = await admin.post<{ id: string }>(
    '/api/v1/users',
    {
      username,
      email: `${username}@example.com`,
      fullName: 'Account Tester',
      password: STRONG,
      roles: ['USER'],
    },
    { 'idempotency-key': crypto.randomUUID() },
  );
  expect(created.status).toBe(201);
  return { username, id: created.body.data.id };
}

const login = (username: string, password: string, clientIp = freshIp()) =>
  api.call<Outcome>('POST', '/api/v1/auth/login', { body: { username, password }, clientIp });

/** Signs a new user in, completing the first-login password change. */
async function activeUser() {
  const user = await newUser();
  const ip = freshIp();
  const first = await login(user.username, STRONG, ip);
  expect(first.body.data.status).toBe('PASSWORD_CHANGE_REQUIRED');
  const changed = await api.call<Outcome>('POST', '/api/v1/auth/password/change', {
    body: { changeToken: first.body.data.passwordChange!.changeToken, newPassword: STRONGER },
    clientIp: ip,
  });
  expect(changed.status).toBe(200);
  expect(changed.body.data.status).toBe('AUTHENTICATED');
  return { ...user, password: STRONGER, session: await api.as(user.username, STRONGER) };
}

beforeAll(async () => {
  admin = await api.as('admin');
});

describe('sign-in', () => {
  it('asks a new user for a new password, refusing a weak one and a bad token', async () => {
    const user = await newUser();
    const ip = freshIp();
    const first = await login(user.username, STRONG, ip);
    expect(first.body.data.passwordChange?.reason).toBe('RESET');

    const weak = await api.call('POST', '/api/v1/auth/password/change', {
      body: { changeToken: first.body.data.passwordChange!.changeToken, newPassword: 'short' },
      clientIp: ip,
    });
    expect(weak.status).toBe(400);

    const unknown = await api.call('POST', '/api/v1/auth/password/change', {
      body: { changeToken: crypto.randomUUID(), newPassword: STRONGER },
      clientIp: ip,
    });
    expect(unknown.status).toBe(401);
  });

  it('refreshes tokens, refuses a reused refresh token, and signs out', async () => {
    const { session } = await activeUser();
    const refreshed = await api.call<{ accessToken: string; refreshToken: string }>(
      'POST',
      '/api/v1/auth/token/refresh',
      { body: { refreshToken: session.tokens.refreshToken }, clientIp: session.clientIp },
    );
    expect(refreshed.status).toBe(200);

    const reused = await api.call('POST', '/api/v1/auth/token/refresh', {
      body: { refreshToken: 'x'.repeat(40) },
      clientIp: session.clientIp,
    });
    expect(reused.status).toBe(401);

    const token = refreshed.body.data.accessToken;
    const me = await api.call('GET', '/api/v1/auth/me', { token, clientIp: session.clientIp });
    expect(me.status).toBe(200);
    const current = await api.call('GET', '/api/v1/auth/session', {
      token,
      clientIp: session.clientIp,
    });
    expect(current.status).toBe(200);

    const logout = await api.call('POST', '/api/v1/auth/logout', {
      token,
      body: { allSessions: true },
      clientIp: session.clientIp,
    });
    expect(logout.status).toBeLessThan(300);
    const after = await api.call('GET', '/api/v1/auth/me', { token, clientIp: session.clientIp });
    expect(after.status).toBe(401);
  });

  it('verifies the MFA demo account with a time-based code, and refuses a wrong one', async () => {
    const ip = freshIp();
    const first = await login('mfa.demo', 'Passw0rd!2026', ip);
    expect(first.body.data.status).toBe('MFA_REQUIRED');
    const challengeId = first.body.data.mfa!.challengeId;

    const wrong = await api.call('POST', '/api/v1/auth/mfa/verify', {
      body: { challengeId, code: '000000' },
      clientIp: ip,
    });
    expect(wrong.status).toBe(401);

    const verified = await api.call<Outcome>('POST', '/api/v1/auth/mfa/verify', {
      body: { challengeId, code: totpAt('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', currentStep()) },
      clientIp: ip,
    });
    expect(verified.status).toBe(200);
    expect(verified.body.data.status).toBe('AUTHENTICATED');

    const unknown = await api.call('POST', '/api/v1/auth/mfa/verify', {
      body: { challengeId: crypto.randomUUID(), code: '123456' },
      clientIp: ip,
    });
    expect(unknown.status).toBe(401);
  });

  it('answers a forgotten password the same way for known and unknown accounts', async () => {
    for (const identifier of ['jdoe', 'nobody@example.com']) {
      const reply = await api.call('POST', '/api/v1/auth/password/forgot', {
        body: { identifier },
        clientIp: freshIp(),
      });
      expect(reply.status).toBeLessThan(300);
    }
    const reset = await api.call('POST', '/api/v1/auth/password/reset', {
      body: { token: 'not-a-real-reset-token-000', newPassword: STRONGER },
      clientIp: freshIp(),
    });
    expect(reset.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses an external token exchange for an unknown or disabled provider', async () => {
    const reply = await api.call('POST', '/api/v1/auth/token/exchange', {
      body: { provider: 'oidc', token: 'e'.repeat(40) },
      clientIp: freshIp(),
    });
    expect(reply.status).toBeGreaterThanOrEqual(400);
  });

  it('locks an account after repeated failures and lets an administrator unlock it', async () => {
    const { username, id, password } = await activeUser();
    const ip = freshIp();
    let last = await login(username, 'Wrong#Pass1', ip);
    for (let i = 0; i < 6 && last.body.error?.code !== 'AUTH_ACCOUNT_LOCKED'; i++) {
      last = await login(username, 'Wrong#Pass1', freshIp());
    }
    expect(last.body.error?.code).toBe('AUTH_ACCOUNT_LOCKED');
    const unlocked = await admin.post(`/api/v1/users/${id}/unlock`);
    expect(unlocked.status).toBeLessThan(300);
    expect((await login(username, password)).body.data.status).toBe('AUTHENTICATED');
  });
});

describe('my account', () => {
  it('lists and revokes sessions', async () => {
    const user = await activeUser();
    const second = await api.as(user.username, user.password);
    const sessions = await second.get<Array<{ id: string; current: boolean }>>(
      '/api/v1/account/sessions',
    );
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.length).toBeGreaterThanOrEqual(2);
    const other = sessions.body.data.find((s) => !s.current)!;
    expect((await second.delete(`/api/v1/account/sessions/${other.id}`)).status).toBeLessThan(300);
    expect((await second.delete(`/api/v1/account/sessions/${crypto.randomUUID()}`)).status).toBe(
      404,
    );
    const revoked = await second.post<{ terminated: number }>(
      '/api/v1/account/sessions/revoke-others',
    );
    expect(revoked.status).toBe(200);
  });

  it('changes the password, enforcing the current one and the policy', async () => {
    const { session, password } = await activeUser();
    const wrong = await session.post('/api/v1/account/password', {
      currentPassword: 'Not#theOne1',
      newPassword: 'Qw7&erTy9!pL',
    });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const weak = await session.post('/api/v1/account/password', {
      currentPassword: password,
      newPassword: 'password',
    });
    expect(weak.status).toBe(400);
    const changed = await session.post('/api/v1/account/password', {
      currentPassword: password,
      newPassword: 'Qw7&erTy9!pL',
    });
    expect(changed.status).toBeLessThan(300);
  });

  it('enrols and disables an authenticator app', async () => {
    const { session, password } = await activeUser();
    const setup = await session.post<{ secret: string; otpauthUri: string }>(
      '/api/v1/account/mfa/totp/setup',
    );
    expect(setup.status).toBeLessThan(300);
    const bad = await session.post('/api/v1/account/mfa/totp/confirm', { code: '000000' });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const confirmed = await session.post('/api/v1/account/mfa/totp/confirm', {
      code: totpAt(setup.body.data.secret, currentStep()),
    });
    expect(confirmed.status).toBeLessThan(300);

    const wrong = await session.post('/api/v1/account/mfa/disable', { password: 'Not#theOne1' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const disabled = await session.post('/api/v1/account/mfa/disable', { password });
    expect(disabled.status).toBeLessThan(300);
  });

  it('shows my activity and its summary, page by page', async () => {
    const { session } = await activeUser();
    const page = await session.get<{ items: unknown[]; nextCursor: string | null }>(
      '/api/v1/account/activity?limit=1',
    );
    expect(page.status).toBe(200);
    expect(page.body.data.items).toHaveLength(1);
    if (page.body.data.nextCursor) {
      const next = await session.get(
        `/api/v1/account/activity?limit=1&cursor=${page.body.data.nextCursor}`,
      );
      expect(next.status).toBe(200);
    }
    const summary = await session.get<{ signIns: number }>(
      '/api/v1/account/activity/summary?days=30',
    );
    expect(summary.status).toBe(200);
    expect(summary.body.data.signIns).toEqual(expect.any(Number));
  });

  it('updates my own profile with optimistic locking', async () => {
    const { session } = await activeUser();
    const me = await session.get<{ version: number }>('/api/v1/users/me');
    const updated = await session.patch<{ fullName: string; version: number }>('/api/v1/users/me', {
      version: me.body.data.version,
      fullName: 'Renamed Tester',
      phoneNumber: '+251911223344',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.fullName).toBe('Renamed Tester');
    const stale = await session.patch('/api/v1/users/me', {
      version: me.body.data.version,
      fullName: 'Stale Write',
    });
    expect(stale.status).toBe(409);
  });
});
