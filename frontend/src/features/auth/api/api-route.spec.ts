import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/infrastructure/logging/logger';
import { bff, invoke, withCsrf } from '@/testing/bff';
import { publicApiRoute } from './api-route';

vi.mock('server-only', () => ({}));
vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));
vi.mock('next/headers', async () => (await import('@/testing/bff')).nextHeadersModule());
vi.mock('@/infrastructure/config/env', async () => (await import('@/testing/bff')).envModule());
vi.mock('@/infrastructure/api/backend', async () =>
  (await import('@/testing/bff')).backendModule(),
);

const route = publicApiRoute(async () => ({ data: 'ok' }));
const post = () => invoke(route, { method: 'POST', url: '/api/auth/login', body: {} });

describe('BFF CSRF and origin check', () => {
  beforeEach(() => {
    bff.reset();
    vi.mocked(logger.warn).mockClear();
    vi.stubEnv('AUTH_URL', '');
    vi.stubEnv('SITE_URL', '');
    withCsrf();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a form posted from the host the proxy reports', async () => {
    bff.header('origin', 'https://digitalproducts.example');
    bff.header('host', '127.0.0.1:3030');
    bff.header('x-forwarded-host', 'digitalproducts.example');
    expect((await post()).status).toBe(200);
  });

  it('accepts the configured site address when the proxy rewrites Host', async () => {
    vi.stubEnv('AUTH_URL', 'https://digitalproducts.example');
    bff.header('origin', 'https://digitalproducts.example');
    bff.header('host', 'localhost:3030');
    expect((await post()).status).toBe(200);
  });

  it('accepts SITE_URL as well', async () => {
    vi.stubEnv('SITE_URL', 'https://www.digitalproducts.example');
    bff.header('origin', 'https://www.digitalproducts.example');
    bff.header('host', '10.0.0.5');
    expect((await post()).status).toBe(200);
  });

  it('accepts a request without Origin that carries the CSRF pair', async () => {
    bff.header('host', 'localhost:3030');
    expect((await post()).status).toBe(200);
  });

  it('refuses another site and logs the hosts it compared', async () => {
    vi.stubEnv('AUTH_URL', 'https://digitalproducts.example');
    bff.header('origin', 'https://evil.example');
    bff.header('host', 'localhost:3030');
    const { status, json } = await post();
    expect(status).toBe(403);
    expect(json?.error?.code ?? json?.code).toBe('CSRF_FAILED');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        sameOrigin: false,
        csrfOk: true,
        origin: 'evil.example',
        allowedHosts: ['localhost:3030', 'digitalproducts.example'],
      }),
      'CSRF validation failed',
    );
  });

  it('refuses Origin: null instead of failing with a server error', async () => {
    bff.header('origin', 'null');
    bff.header('host', 'localhost:3030');
    expect((await post()).status).toBe(403);
  });

  it('refuses the right origin without the CSRF token', async () => {
    bff.reset();
    bff.header('origin', 'https://digitalproducts.example');
    bff.header('x-forwarded-host', 'digitalproducts.example');
    const { status } = await post();
    expect(status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sameOrigin: true, csrfOk: false }),
      'CSRF validation failed',
    );
  });
});
