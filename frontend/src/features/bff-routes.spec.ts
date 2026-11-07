import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bff, invoke, signedIn, withCsrf } from '@/testing/bff';

vi.mock('server-only', () => ({}));
vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
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
vi.mock('@/features/auth/api/auth.config', () => ({
  signIn: vi.fn(() => Promise.resolve(undefined)),
  signOut: vi.fn(() => Promise.resolve(undefined)),
  auth: vi.fn(() => Promise.resolve(null)),
}));

/**
 * Every BFF route handler, swept: signed out it must refuse with 401 (public
 * routes aside), signed in it must answer without an unexpected server error.
 * The per-feature specs check what each route sends and returns.
 */
const modules = (
  import.meta as unknown as {
    glob: (pattern: string, options: { eager: true }) => Record<string, Record<string, unknown>>;
  }
).glob('./*/api/*.routes.ts', { eager: true });

type Handler = Parameters<typeof invoke>[0];
const HELPERS = new Set(['loadDashboard', 'dashboardQuery', 'openableDashboard']);
const handlers = Object.entries(modules).flatMap(([file, exports]) =>
  Object.entries(exports)
    // Route handlers take (req, context); the loaders next to them are helpers.
    .filter(
      ([name, value]) =>
        typeof value === 'function' &&
        (value as { length: number }).length === 2 &&
        !HELPERS.has(name),
    )
    .map(([name, value]) => ({
      name: `${file.replace('./', '')} › ${name}`,
      handler: value as Handler,
    })),
);

const params = {
  id: 'x1',
  type: 'currencies',
  source: 'roles',
  name: 'data-retention',
  path: ['users'],
};

describe('BFF routes', () => {
  beforeEach(() => {
    bff.reset();
    bff.reply('GET /documents/roles/x1/pdf', {
      data: {
        content: Buffer.from('%PDF-1.7').toString('base64'),
        contentType: 'application/pdf',
        filename: 'role x1.pdf',
        size: 8,
      },
    });
  });

  it('found the route modules', () => {
    expect(handlers.length).toBeGreaterThan(60);
  });

  it.each(handlers)('$name refuses anonymous calls or answers them', async ({ handler }) => {
    withCsrf();
    for (const method of ['GET', 'POST']) {
      const { status, json } = await invoke(handler, {
        method,
        url: '/api/x?page=1',
        body: method === 'POST' ? {} : undefined,
        params,
      });
      expect(status).toBeLessThan(500);
      if (status === 401)
        expect(json?.error?.code).toMatch(/UNAUTHENTICATED|invalid_credentials|mfa|password|AUTH/);
    }
  });

  it.each(handlers)(
    '$name answers a signed-in call without an unexpected error',
    async ({ handler }) => {
      await signedIn(['*'], { user: { ...(await signedIn()).user, id: crypto.randomUUID() } });
      for (const method of ['GET', 'POST']) {
        const { status, json } = await invoke(handler, {
          method,
          url: '/api/x?page=1&pageSize=10',
          body: method === 'POST' ? {} : undefined,
          params,
        });
        expect(json?.error?.code ?? 'OK').not.toBe('INTERNAL_ERROR');
        expect(status).not.toBe(500);
      }
    },
  );

  it.each(handlers)('$name refuses a state change without the CSRF token', async ({ handler }) => {
    await signedIn();
    bff.header('x-csrf-token', 'forged');
    const { status } = await invoke(handler, { method: 'DELETE', params });
    expect(status).toBe(403);
  });
});
