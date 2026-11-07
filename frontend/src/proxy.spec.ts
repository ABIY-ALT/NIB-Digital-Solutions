import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '@/features/auth/api/session-cookie';
import type { AppCoreSessionData } from '@/features/auth/api/session-data';
import { CSRF_COOKIE, issueCsrfToken } from '@/infrastructure/security/csrf';

const CSRF_SECRET = 'c'.repeat(48);

const session = vi.hoisted(() => ({
  token: null as { appcore?: unknown } | null,
  state: 'active' as 'active' | 'idle' | 'expired',
  needsRefresh: false,
  refresh: vi.fn(),
  rateAllowed: true,
}));

vi.mock('@/infrastructure/config/env', () => ({
  env: () => ({ AUTH_SECRET: 'a'.repeat(48), CSRF_SECRET: 'c'.repeat(48) }),
}));
vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/infrastructure/security/rate-limit', () => ({
  rateLimit: () => ({ allowed: session.rateAllowed, remaining: 0, retryAfterSeconds: 42 }),
}));
vi.mock('@/features/auth/api/session-cookie', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  decodeSession: vi.fn(async () => session.token),
  encodeSession: vi.fn(async () => 'x'.repeat(5000)),
}));
vi.mock('@/features/auth/api/session-data', () => ({
  sessionState: () => session.state,
}));
vi.mock('@/features/auth/api/session-refresh', () => ({
  needsRefresh: () => session.needsRefresh,
  refreshSession: session.refresh,
}));

const { proxy, config } = await import('./proxy');

const data = (permissions: string[] = []) =>
  ({ user: { id: 'u-1', permissions, roles: [] } }) as unknown as AppCoreSessionData;

function request(
  path: string,
  {
    method = 'GET',
    cookies = {},
    headers = {},
  }: { method?: string; cookies?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    method,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
  });
}

const signedIn = { [SESSION_COOKIE]: 'jwt' };

describe('proxy', () => {
  beforeEach(() => {
    session.token = null;
    session.state = 'active';
    session.needsRefresh = false;
    session.rateAllowed = true;
    session.refresh.mockReset();
  });

  it('matches every path except static assets', () => {
    expect(config.matcher).toHaveLength(1);
  });

  it('rate-limits sign-in attempts per client', async () => {
    session.rateAllowed = false;
    const res = await proxy(
      request('/api/auth/login', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect((await res.json()).error.code).toBe('RATE_LIMITED');

    // GETs and other paths are not limited.
    expect((await proxy(request('/api/auth/login'))).status).not.toBe(429);
  });

  it('lets sign-in attempts through while under the limit, and keeps a valid correlation id', async () => {
    const res = await proxy(
      request('/api/auth/login', {
        method: 'POST',
        headers: { 'x-real-ip': '1.2.3.4', 'x-correlation-id': 'req-12345678' },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-correlation-id')).toBe('req-12345678');
    expect(res.headers.get('content-security-policy')).toContain('nonce-');
    expect(res.cookies.get(CSRF_COOKIE)).toBeTruthy();
  });

  it('replaces a malformed correlation id', async () => {
    const res = await proxy(request('/login', { headers: { 'x-correlation-id': 'bad id!' } }));
    expect(res.headers.get('x-correlation-id')).not.toBe('bad id!');
  });

  it('keeps a valid CSRF cookie', async () => {
    const res = await proxy(
      request('/login', { cookies: { [CSRF_COOKIE]: issueCsrfToken(CSRF_SECRET) } }),
    );
    expect(res.cookies.get(CSRF_COOKIE)).toBeUndefined();
  });

  it('sends anonymous page requests to sign-in, and API calls get 401', async () => {
    let res = await proxy(request('/users?page=2'));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('callbackUrl')).toBe('/users?page=2');

    res = await proxy(request('/api/users'));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');

    // Staff marketplace screens stay behind sign-in.
    res = await proxy(request('/digital-products'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
  });

  it('serves the public marketplace without a session, and only the marketplace', async () => {
    for (const path of [
      '/',
      '/products',
      '/products/school-management-system',
      '/industries',
      '/solutions',
      '/about',
      '/contact',
    ]) {
      expect((await proxy(request(path))).status, path).toBe(200);
    }
    // Public BFF routes reach their handlers (the staff ones enforce the session themselves).
    expect((await proxy(request('/api/marketplace/catalog'))).status).toBe(200);
    // Look-alike paths are not public: only exact prefixes and their sub-paths are.
    // They are never served: an anonymous visitor gets the page-not-found.
    expect((await proxy(request('/productsXYZ'))).headers.get('x-middleware-rewrite')).toContain(
      '/__page-not-found',
    );
    expect((await proxy(request('/api/demo-requests'))).status).toBe(401);
  });

  it('answers an anonymous unknown page with the page-not-found, never the staff sign-in', async () => {
    let res = await proxy(request('/prodcts/old-link'));
    expect(res.status).not.toBe(307);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/__page-not-found');
    // The page gets the same security headers as any other.
    expect(res.headers.get('content-security-policy')).toContain('nonce-');

    // Staff pages, including ones only reachable from a menu section, still ask for sign-in.
    for (const path of ['/users', '/digital-products/abc', '/dashboards', '/dashboard']) {
      res = await proxy(request(path));
      expect(new URL(res.headers.get('location')!).pathname, path).toBe('/login');
    }
    // Unknown API calls still get 401.
    expect((await proxy(request('/api/unknown'))).status).toBe(401);

    // Signed in, an unknown page is not rewritten (Next.js answers 404 itself).
    session.token = { appcore: data([]) };
    res = await proxy(request('/prodcts', { cookies: signedIn }));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('allows demo video embeds on marketplace pages only', async () => {
    const site = (await proxy(request('/products/school-management-system'))).headers.get(
      'content-security-policy',
    )!;
    expect(site).toContain('frame-src https://www.youtube-nocookie.com https://player.vimeo.com');
    session.token = { appcore: data(['users:read']) };
    const app = (await proxy(request('/users', { cookies: signedIn }))).headers.get(
      'content-security-policy',
    )!;
    expect(app).not.toContain('frame-src');
  });

  it('ends idle and expired sessions and removes their cookies', async () => {
    session.token = { appcore: data() };
    session.state = 'idle';
    let res = await proxy(request('/users', { cookies: signedIn }));
    expect(new URL(res.headers.get('location')!).searchParams.get('reason')).toBe('idle');
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);

    session.state = 'expired';
    res = await proxy(request('/api/users', { cookies: signedIn }));
    expect((await res.json()).error.code).toBe('AUTH_SESSION_EXPIRED');

    // On a public page the ended session is cleared and the page served.
    res = await proxy(request('/login', { cookies: signedIn }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);
  });

  it('sends signed-in users home from sign-in; the root is the public marketplace', async () => {
    session.token = { appcore: data(['users:read']) };
    const res = await proxy(request('/login', { cookies: signedIn }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
    expect((await proxy(request('/', { cookies: signedIn }))).status).toBe(200);
  });

  it('forbids pages the navigation reserves for a permission', async () => {
    session.token = { appcore: data([]) };
    let res = await proxy(request('/users/123', { cookies: signedIn }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/forbidden');

    session.token = { appcore: data(['users:read']) };
    res = await proxy(request('/users/123', { cookies: signedIn }));
    expect(res.status).toBe(200);
    // Pages without a navigation entry need no permission; API calls are left to the backend.
    expect((await proxy(request('/profile', { cookies: signedIn }))).status).toBe(200);
    session.token = { appcore: data([]) };
    expect((await proxy(request('/api/users', { cookies: signedIn }))).status).toBe(200);
  });

  it('refreshes a session about to expire and forwards the new cookie chunks', async () => {
    session.token = { appcore: data(['users:read']) };
    session.needsRefresh = true;
    session.refresh.mockResolvedValue(data(['users:read']));
    const res = await proxy(
      request('/users', {
        cookies: {
          [`${SESSION_COOKIE}.0`]: 'old',
          [`${SESSION_COOKIE}.1`]: 'old',
          [`${SESSION_COOKIE}.2`]: 'old',
          theme: 'dark',
        },
        headers: { 'user-agent': 'vitest' },
      }),
    );
    expect(res.status).toBe(200);
    expect(session.refresh).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userAgent: 'vitest' }),
    );
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toContain(`${SESSION_COOKIE}.0=xxx`);
    expect(setCookie).toContain(`${SESSION_COOKIE}.1=xxx`);
    // The stale third chunk is removed.
    expect(setCookie).toContain(`${SESSION_COOKIE}.2=;`);
    expect(res.headers.get('x-middleware-request-cookie') ?? '').toContain('theme=dark');
  });

  it('ends the session when the refresh token is rejected, and keeps it on transient failures', async () => {
    session.token = { appcore: data() };
    session.needsRefresh = true;
    session.refresh.mockResolvedValue(null);
    let res = await proxy(request('/profile', { cookies: signedIn }));
    expect(new URL(res.headers.get('location')!).searchParams.get('reason')).toBe('expired');

    session.refresh.mockRejectedValue(new Error('backend down'));
    res = await proxy(request('/profile', { cookies: signedIn }));
    expect(res.status).toBe(200);
  });
});
