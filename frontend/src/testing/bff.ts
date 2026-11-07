import { vi } from 'vitest';
import { SESSION_COOKIE, encodeSession } from '@/features/auth/api/session-cookie';
import type { AppCoreSessionData } from '@/features/auth/api/session-data';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { CSRF_COOKIE, CSRF_HEADER, issueCsrfToken } from '@/infrastructure/security/csrf';

/**
 * BFF route tests (Node): call a route handler the way Next.js does, with the
 * request headers and cookies it reads through next/headers, a signed-in
 * session (a real encrypted session cookie) and a fake backend that records
 * every call and answers from a table.
 *
 *   vi.mock('next/headers', async () => (await import('@/testing/bff')).nextHeadersModule());
 *   vi.mock('@/infrastructure/config/env', async () => (await import('@/testing/bff')).envModule());
 *   vi.mock('@/infrastructure/api/backend', async () => (await import('@/testing/bff')).backendModule());
 *
 *   await signedIn(['users:read']);
 *   bff.reply('GET /users', { data: [user], meta });
 *   const res = await invoke(list, { url: '/api/users?page=2' });
 */

export const TEST_ENV = {
  AUTH_SECRET: 'a'.repeat(48),
  CSRF_SECRET: 'c'.repeat(48),
  BACKEND_URL: 'http://backend.test',
  BACKEND_API_PREFIX: '/api/v1',
  BACKEND_SERVICE_CLIENT_ID: 'web',
  BACKEND_SERVICE_CLIENT_SECRET: 's'.repeat(40),
  BACKEND_TIMEOUT_MS: 5000,
  PAYLOAD_ENCRYPTION_ENABLED: false,
  NODE_ENV: 'test',
};

export interface BackendCall {
  method: string;
  path: string;
  body?: unknown;
  query?: unknown;
  accessToken?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

type Reply =
  | { data: unknown; meta?: unknown; message?: string | null; status?: number }
  | ApiClientError
  | ((call: BackendCall) => Reply);

const state = {
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  calls: [] as BackendCall[],
  replies: new Map<string, Reply>(),
  setCookies: [] as Array<{ name: string; value: string }>,
};

/** Shared state of the fakes: replies, recorded calls, request headers and cookies. */
export const bff = {
  get calls() {
    return state.calls;
  },
  get setCookies() {
    return state.setCookies;
  },
  /** Reply for "METHOD /path" (the backend path, after the API prefix). */
  reply(key: string, reply: Reply) {
    state.replies.set(key, reply);
  },
  header(name: string, value: string) {
    state.headers.set(name.toLowerCase(), value);
  },
  cookie(name: string, value: string) {
    state.cookies.set(name, value);
  },
  reset() {
    state.headers.clear();
    state.cookies.clear();
    state.calls.length = 0;
    state.replies.clear();
    state.setCookies.length = 0;
  },
  /** An error reply, as the backend client throws it. */
  error(status: number, code: string, details?: Array<{ field: string; message: string }>) {
    return new ApiClientError({ code, message: code, status, correlationId: 'corr-be', details });
  },
};

function answer(call: BackendCall): Promise<unknown> {
  state.calls.push(call);
  let reply: Reply | undefined =
    state.replies.get(`${call.method} ${call.path}`) ?? state.replies.get(`${call.method} *`);
  if (typeof reply === 'function') reply = reply(call);
  if (reply instanceof ApiClientError) return Promise.reject(reply);
  const r = (reply ?? { data: call.method === 'GET' ? [] : {} }) as {
    data: unknown;
    meta?: unknown;
    message?: string | null;
    status?: number;
  };
  return Promise.resolve({
    data: r.data,
    meta: r.meta,
    message: r.message ?? null,
    correlationId: 'corr-be',
    status: r.status ?? 200,
  });
}

type Init = {
  query?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  accessToken?: string;
};

function fakeClient(accessToken?: string) {
  const verb = (method: string) => (path: string, bodyOrInit?: unknown, maybeInit?: Init) => {
    const hasBody = method !== 'GET' && method !== 'DELETE';
    const init = (hasBody ? maybeInit : bodyOrInit) as Init | undefined;
    return answer({
      method,
      path,
      body: hasBody ? bodyOrInit : undefined,
      query: init?.query,
      headers: init?.headers,
      idempotencyKey: init?.idempotencyKey,
      accessToken: accessToken ?? init?.accessToken,
    });
  };
  return {
    get: verb('GET'),
    post: verb('POST'),
    patch: verb('PATCH'),
    put: verb('PUT'),
    delete: verb('DELETE'),
    request: (req: BackendCall & { method: string }) =>
      answer({ ...req, accessToken: accessToken ?? req.accessToken }),
    as: (token: string) => fakeClient(token),
  };
}

export function backendModule() {
  const client = fakeClient();
  return { backend: () => client };
}

export function envModule() {
  return { env: () => TEST_ENV };
}

export function nextHeadersModule() {
  const jar = {
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined,
    getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })),
    has: (name: string) => state.cookies.has(name),
    set: vi.fn((name: string | { name: string; value: string }, value?: string) => {
      const entry = typeof name === 'string' ? { name, value: value ?? '' } : name;
      state.setCookies.push(entry);
      state.cookies.set(entry.name, entry.value);
    }),
    delete: vi.fn((name: string) => state.cookies.delete(name)),
  };
  return {
    headers: () => Promise.resolve(new Headers([...state.headers])),
    cookies: () => Promise.resolve(jar),
  };
}

/** Signs the request in: a real encrypted session cookie and a valid CSRF pair. */
export async function signedIn(
  permissions: string[] = ['*'],
  overrides: Partial<AppCoreSessionData> = {},
): Promise<AppCoreSessionData> {
  const now = Date.now();
  const session: AppCoreSessionData = {
    user: {
      id: 'u-1',
      username: 'admin',
      name: 'Ada Admin',
      email: 'admin@example.com',
      roles: ['SUPER_ADMIN'],
      permissions,
      branchCode: null,
      mfaEnabled: false,
    },
    accessToken: 'access-token',
    accessTokenExpiresAt: now + 600_000,
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: now + 3_600_000,
    backendSessionId: 'sess-1',
    lastActivity: now,
    idleTimeoutSeconds: 1800,
    ...overrides,
  };
  state.cookies.set(
    SESSION_COOKIE,
    await encodeSession({ appcore: session }, TEST_ENV.AUTH_SECRET, 3600),
  );
  withCsrf();
  return session;
}

/** A valid double-submit CSRF pair (anonymous requests too). */
export function withCsrf() {
  const token = issueCsrfToken(TEST_ENV.CSRF_SECRET);
  state.cookies.set(CSRF_COOKIE, token);
  state.headers.set(CSRF_HEADER, token);
}

/** Any route handler: `never` params accept every handler's own params type. */
type Handler = (req: Request, context: { params: Promise<never> }) => Promise<Response>;

/** A parsed JSON envelope; tests read arbitrary fields of it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions walk the untyped envelope
type Json = Record<string, any>;

/** Calls a route handler; returns the status and the parsed JSON body (or the raw response). */
export async function invoke(
  handler: Handler,
  {
    method = 'GET',
    url = '/api/test',
    body,
    params,
    headers = {},
  }: {
    method?: string;
    url?: string;
    body?: unknown;
    params?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
) {
  const req = new Request(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res = await handler(req, { params: Promise.resolve((params ?? {}) as never) });
  const type = res.headers.get('content-type') ?? '';
  const json = type.includes('json') ? ((await res.clone().json()) as Json) : null;
  return { status: res.status, json, res };
}
