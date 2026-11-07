import 'reflect-metadata';
import '#core/presentation/http/express-request.js';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { setupApp } from '#bootstrap/setup-app.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { SignatureHeaders, signRequest } from '#core/infrastructure/crypto/request-signature.js';
import { AppModule } from '../src/app.module.js';

// The whole Nest app over real HTTP, set up the way main.ts sets it up, against
// the PostgreSQL in DATABASE_URL (migrated and seeded by test/global-setup.ts).
// Requests to /api are signed the way the BFF signs them, with the service
// client secret from the app's own configuration.

interface Envelope<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  correlationId?: string;
}

interface CallOptions {
  body?: unknown;
  token?: string;
  /** false sends no BFF signature at all. */
  sign?: boolean;
  /** Headers set after signing, e.g. to replay or tamper with a request. */
  headers?: Record<string, string>;
}

let app: NestExpressApplication;
let config: AppConfig;
let baseUrl: string;

/** The headers the BFF adds to every backend call (protocol v1). */
function signatureHeaders(method: string, path: string, body?: string): Record<string, string> {
  const [clientId, secret] = [...config.serviceAuth.clients][0]!;
  const input = {
    method,
    pathWithQuery: path,
    timestamp: String(Date.now()),
    nonce: randomUUID(),
    correlationId: randomUUID(),
    clientIp: '127.0.0.1',
    body,
  };

  return {
    [SignatureHeaders.clientId]: clientId,
    [SignatureHeaders.timestamp]: input.timestamp,
    [SignatureHeaders.nonce]: input.nonce,
    [SignatureHeaders.correlationId]: input.correlationId,
    [SignatureHeaders.clientIp]: input.clientIp,
    [SignatureHeaders.signature]: signRequest(input, secret),
  };
}

function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    ...(options.sign === false ? {} : signatureHeaders(method, path, body)),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  };

  return fetch(`${baseUrl}${path}`, { method, headers, body });
}

async function signIn(username: string, password: string): Promise<Response> {
  return call('POST', '/api/v1/auth/login', { body: { username, password } });
}

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    rawBody: true,
  });
  config = app.get<AppConfig>(APP_CONFIG);
  setupApp(app, config);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe('health probes', () => {
  it('GET /health/live answers without a BFF signature', async () => {
    const response = await call('GET', '/health/live', { sign: false });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /health/ready reaches the database and the key/value store', async () => {
    const response = await call('GET', '/health/ready', { sign: false });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      details: { database: { status: 'up' }, kvStore: { status: 'up' } },
    });
  });
});

describe('security headers', () => {
  it.each([
    ['a probe', '/health/live', false],
    ['a request refused by service authentication', '/api/v1/auth/password-policy', false],
    ['an unknown route', '/api/v1/no-such-route', true],
    ['a path outside the API', '/', false],
  ])('are sent on %s, without X-Powered-By', async (_case, path, sign) => {
    const response = await call('GET', path, { sign });
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    // The probes send Terminus' "no-cache, no-store, must-revalidate".
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.has('x-powered-by')).toBe(false);
  });

  it('answers an unknown route with the error envelope', async () => {
    const response = await call('GET', '/api/v1/no-such-route');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });

  // Express answered these with its HTML
  // "Cannot GET /x" page, which names the framework.
  it.each(['/', '/health', '/latest/meta-data/'])(
    'answers %s, outside the API, with the error envelope instead of an HTML page',
    async (path) => {
      const response = await call('GET', path, { sign: false });

      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: 'ROUTE_NOT_FOUND' },
        path,
      });
    },
  );
});

describe('service authentication (the BFF identity)', () => {
  it('refuses an unsigned /api request', async () => {
    const response = await call('GET', '/api/v1/auth/password-policy', { sign: false });
    const body = (await response.json()) as Envelope;

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: { code: 'SERVICE_AUTH_FAILED' } });
    expect(body.correlationId).toEqual(expect.any(String));
  });

  it('refuses a request whose body differs from the one that was signed', async () => {
    const path = '/api/v1/auth/login';
    const signed = signatureHeaders('POST', path, JSON.stringify({ username: 'admin' }));
    const response = await call('POST', path, {
      sign: false,
      body: { username: 'admin', password: 'not-what-was-signed' },
      headers: signed,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_AUTH_FAILED' } });
  });

  it('accepts a signed request once and refuses its replay', async () => {
    const path = '/api/v1/auth/password-policy';
    const signed = signatureHeaders('GET', path);

    const first = await call('GET', path, { sign: false, headers: signed });
    const replay = await call('GET', path, { sign: false, headers: signed });

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ success: true, data: expect.any(Object) });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ error: { code: 'SERVICE_AUTH_FAILED' } });
  });
});

describe('sign-in', () => {
  it('signs in a seeded user and serves their profile with the access token', async () => {
    const login = await signIn('admin', 'Admin@12345');
    const outcome = (await login.json()) as Envelope<{
      status: string;
      tokens: { accessToken: string; sessionId: string };
    }>;

    expect(login.status).toBe(200);
    expect(outcome.data?.status).toBe('AUTHENTICATED');

    const me = await call('GET', '/api/v1/users/me', { token: outcome.data!.tokens.accessToken });

    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ success: true, data: { username: 'admin' } });
  });

  it('refuses the profile without an access token', async () => {
    const response = await call('GET', '/api/v1/users/me');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('refuses a wrong password without saying which part was wrong', async () => {
    const response = await signIn('auditor', 'not-the-password');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'AUTH_INVALID_CREDENTIALS' },
    });
  });

  it('rejects a login body with an unexpected field', async () => {
    const response = await call('POST', '/api/v1/auth/login', {
      body: { username: 'admin', password: 'Admin@12345', role: 'SUPER_ADMIN' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});
