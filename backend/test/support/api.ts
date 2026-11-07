import 'reflect-metadata';
import '#core/presentation/http/express-request.js';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { setupApp } from '#bootstrap/setup-app.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { SignatureHeaders, signRequest } from '#core/infrastructure/crypto/request-signature.js';
import { AppModule } from '../../src/app.module.js';

/**
 * Shared harness of the API tests: the whole Nest app over real HTTP, set up
 * the way main.ts sets it up, against the PostgreSQL in DATABASE_URL (migrated
 * and seeded by test/global-setup.ts). Requests to /api are signed the way the
 * BFF signs them.
 *
 *   const api = useApi();
 *   const admin = await api.as('admin');
 *   const users = await admin.get('/api/v1/users');
 *
 * The files share one database and run one after another: tests create the
 * records they change (and never sign the seeded accounts out, lock them or
 * change their passwords).
 */

export interface Envelope<T = unknown> {
  success: boolean;
  data: T;
  meta?: { pagination?: { totalItems: number; page: number; pageSize: number } };
  error?: { code: string; message: string; details?: unknown };
  correlationId?: string;
}

export interface CallOptions {
  body?: unknown;
  token?: string;
  /** false sends no BFF signature at all. */
  sign?: boolean;
  /** Headers set after signing, e.g. to replay or tamper with a request. */
  headers?: Record<string, string>;
  /** End-user IP the BFF forwards (rate limits are kept per IP). */
  clientIp?: string;
}

export interface ApiReply<T = unknown> {
  status: number;
  body: Envelope<T>;
  headers: Headers;
}

/** Passwords of the seeded demo accounts. */
export const SEEDED_PASSWORDS: Record<string, string> = {
  admin: 'Admin@12345',
  useradmin: 'Passw0rd!2026',
  manager: 'Passw0rd!2026',
  auditor: 'Passw0rd!2026',
  jdoe: 'Passw0rd!2026',
  'mfa.demo': 'Passw0rd!2026',
};

let ipCounter = 0;
/** A fresh client address, so per-IP sign-in limits never interfere between tests. */
export const freshIp = () => `10.77.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

export function useApi() {
  let app: NestExpressApplication;
  let config: AppConfig;
  let baseUrl = '';

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

  /** The headers the BFF adds to every backend call (protocol v1). */
  function signatureHeaders(
    method: string,
    path: string,
    body?: string,
    clientIp = '127.0.0.1',
  ): Record<string, string> {
    const [clientId, secret] = [...config.serviceAuth.clients][0]!;
    const input = {
      method,
      pathWithQuery: path,
      timestamp: String(Date.now()),
      nonce: randomUUID(),
      correlationId: randomUUID(),
      clientIp,
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

  function raw(method: string, path: string, options: CallOptions = {}): Promise<Response> {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string> = {
      ...(options.sign === false ? {} : signatureHeaders(method, path, body, options.clientIp)),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    };
    return fetch(`${baseUrl}${path}`, { method, headers, body });
  }

  async function call<T = unknown>(
    method: string,
    path: string,
    options: CallOptions = {},
  ): Promise<ApiReply<T>> {
    const response = await raw(method, path, options);
    const text = await response.text();
    const body = (text ? JSON.parse(text) : null) as Envelope<T>;
    return { status: response.status, body, headers: response.headers };
  }

  /** Signs in and returns a client bound to the access token. */
  async function as(username: string, password = SEEDED_PASSWORDS[username]!) {
    const clientIp = freshIp();
    const login = await call<{
      status: string;
      tokens: { accessToken: string; refreshToken: string; sessionId: string };
    }>('POST', '/api/v1/auth/login', { body: { username, password }, clientIp });
    if (login.body.data?.status !== 'AUTHENTICATED') {
      throw new Error(`Sign-in of ${username} failed: ${JSON.stringify(login.body)}`);
    }
    return client(login.body.data.tokens.accessToken, login.body.data.tokens, clientIp);
  }

  function client(
    token: string,
    tokens: { accessToken: string; refreshToken: string; sessionId: string },
    clientIp: string,
  ) {
    const bound =
      (method: string) =>
      <T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) =>
        call<T>(method, path, { token, body, headers, clientIp });
    return {
      token,
      tokens,
      clientIp,
      get: bound('GET'),
      post: bound('POST'),
      patch: bound('PATCH'),
      put: bound('PUT'),
      delete: bound('DELETE'),
      raw: (method: string, path: string, options: CallOptions = {}) =>
        raw(method, path, { token, clientIp, ...options }),
    };
  }

  return {
    raw,
    call,
    as,
    get config() {
      return config;
    },
    get app() {
      return app;
    },
  };
}

export type ApiClient = Awaited<ReturnType<ReturnType<typeof useApi>['as']>>;

/** A unique suffix for records a test creates (codes, usernames, e-mails). */
export const unique = (prefix = 't') =>
  `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
