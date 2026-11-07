import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { BackendClient, BoundBackendClient } from '@/infrastructure/api/backend-client';
import { backend } from '@/infrastructure/api/backend';
import { appConfig } from '@/infrastructure/config/app.config';
import { env } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import { CSRF_COOKIE, CSRF_HEADER, verifyCsrf } from '@/infrastructure/security/csrf';
import { ApiClientError, isApiClientError } from '@/shared/errors/api-client-error';
import { parseListParams, withListDefaults, type ListDefaults } from '@/shared/lib/list-params';
import type { ListParams, ResponseMeta, SessionUser } from '@/shared/types';
import { meetsRequirement, type AccessRequirement } from '../permissions';
import { getSession } from './session';
import type { AppCoreSessionData } from './session-data';

/**
 * Next.js API route helpers — the ONLY way the browser reaches the backend:
 *
 *   React component → hook (TanStack Query) → /api/* (this) → NestJS API
 *
 * Each handler gets: correlation id, CSRF + Origin checks on state-changing
 * requests, authentication (encrypted session), a UX-level permission check,
 * the standard response envelope, and error normalisation. The NestJS backend
 * remains the authoritative authorization layer.
 */

export interface ApiResult<T> {
  data: T;
  meta?: ResponseMeta;
  message?: string | null;
  status?: number;
}

interface BaseContext<P> {
  req: Request;
  params: P;
  correlationId: string;
  clientIp: string;
}

export interface ApiContext<P> extends BaseContext<P> {
  user: SessionUser;
  session: AppCoreSessionData;
  /** Backend client bound to the user's access token (tokens never reach the browser). */
  api: BoundBackendClient;
}

export interface PublicApiContext<P> extends BaseContext<P> {
  /** Unauthenticated backend client (service identity only). */
  api: BackendClient;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function errorResponse(error: ApiClientError, path: string): NextResponse {
  const res = NextResponse.json(error.toEnvelope(path), { status: error.status || 500 });
  if (error.correlationId) res.headers.set('x-correlation-id', error.correlationId);
  if (error.retryAfterSeconds) res.headers.set('retry-after', String(error.retryAfterSeconds));
  return res;
}

type RouteHandler<P> = (req: Request, context: { params: Promise<P> }) => Promise<NextResponse>;

function wrap<T, P>(
  run: (base: BaseContext<P>) => Promise<ApiResult<T> | NextResponse>,
): RouteHandler<P> {
  return async (req, context) => {
    const h = await headers();
    const correlationId = h.get('x-correlation-id') ?? crypto.randomUUID();
    const clientIp =
      h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
    const path = new URL(req.url).pathname;
    const started = performance.now();

    try {
      if (MUTATING.has(req.method)) {
        const origin = h.get('origin');
        const host = h.get('x-forwarded-host') ?? h.get('host');
        const sameOrigin = !origin || new URL(origin).host === host;
        const csrfOk = verifyCsrf(
          (await cookies()).get(CSRF_COOKIE)?.value,
          h.get(CSRF_HEADER),
          env().CSRF_SECRET,
        );
        if (!sameOrigin || !csrfOk) {
          logger.warn({ correlationId, path, sameOrigin }, 'CSRF validation failed');
          throw new ApiClientError({
            code: 'CSRF_FAILED',
            message: 'The request could not be verified. Refresh the page and try again.',
            status: 403,
            correlationId,
          });
        }
      }

      const result = await run({
        req,
        params: (await context.params) ?? ({} as P),
        correlationId,
        clientIp,
      });
      if (result instanceof NextResponse) return result;

      logger.info(
        {
          correlationId,
          method: req.method,
          path,
          status: result.status ?? 200,
          durationMs: Math.round(performance.now() - started),
        },
        'BFF request',
      );
      return NextResponse.json(
        {
          success: true,
          data: result.data,
          message: result.message ?? null,
          ...(result.meta ? { meta: result.meta } : {}),
          correlationId,
          timestamp: new Date().toISOString(),
        },
        { status: result.status ?? 200, headers: { 'x-correlation-id': correlationId } },
      );
    } catch (error) {
      if (isApiClientError(error)) {
        logger.warn(
          { correlationId, method: req.method, path, code: error.code, status: error.status },
          'BFF request failed',
        );
        return errorResponse(
          error.correlationId
            ? error
            : new ApiClientError({ ...error, message: error.message, correlationId }),
          path,
        );
      }
      logger.error(
        {
          correlationId,
          method: req.method,
          path,
          err: error instanceof Error ? error.message : String(error),
        },
        'BFF unexpected error',
      );
      return errorResponse(
        new ApiClientError({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
          status: 500,
          correlationId,
        }),
        path,
      );
    }
  };
}

/** Authenticated BFF route (the default). */
export function apiRoute<T, P = Record<string, string>>(
  options: { requires?: AccessRequirement },
  handler: (ctx: ApiContext<P>) => Promise<ApiResult<T> | NextResponse>,
): RouteHandler<P> {
  return wrap<T, P>(async (base) => {
    const session = await getSession();
    if (!session)
      throw new ApiClientError({
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required.',
        status: 401,
        correlationId: base.correlationId,
      });
    if (options.requires && !meetsRequirement(session.user, options.requires)) {
      throw new ApiClientError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
        status: 403,
        correlationId: base.correlationId,
      });
    }
    return handler({
      ...base,
      user: session.user,
      session,
      api: backend().as(session.accessToken),
    });
  });
}

/** Public BFF route (sign-in, MFA, locale) — still CSRF-protected and correlated. */
export function publicApiRoute<T, P = Record<string, string>>(
  handler: (ctx: PublicApiContext<P>) => Promise<ApiResult<T> | NextResponse>,
): RouteHandler<P> {
  return wrap<T, P>((base) => handler({ ...base, api: backend() }));
}

/** Reads and validates a JSON body, turning malformed input into a VALIDATION_FAILED error. */
export async function readJson<T>(req: Request, parse: (value: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiClientError({
      code: 'BAD_REQUEST',
      message: 'The request body is not valid JSON.',
      status: 400,
    });
  }
  return parse(body);
}

/** Zod issues → VALIDATION_FAILED error with field details. */
export function validationError(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): ApiClientError {
  return new ApiClientError({
    code: 'VALIDATION_FAILED',
    message: 'The request contains invalid data.',
    status: 400,
    details: issues.map((i) => ({ field: i.path.map(String).join('.'), message: i.message })),
  });
}

/** Zod schema → body parser for readJson: `await readJson(req, parseWith(createBody))`. */
export function parseWith<T>(schema: {
  safeParse: (
    value: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}) {
  return (value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw validationError(result.error.issues);
    return result.data;
  };
}

/** Parses (and bounds) the list query of an incoming BFF request. */
export function listParamsOf(req: Request, defaults: ListDefaults = {}): ListParams {
  return parseListParams(
    new URL(req.url).searchParams,
    withListDefaults(appConfig.ui.pagination, defaults),
  );
}
