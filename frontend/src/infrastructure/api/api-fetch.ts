import { isApiErrorResponse, type ApiSuccessResponse, type ResponseMeta } from '@/shared/types';
import { ApiClientError } from '@/shared/errors/api-client-error';

export const CSRF_COOKIE = 'appcore.csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const SESSION_EXPIRED_EVENT = 'appcore:session-expired';

export interface ApiRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: URLSearchParams | Record<string, string | number | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Marks polling / background refetches (do not count as user activity). */
  background?: boolean;
}

export interface ApiResult<T> {
  data: T;
  message: string | null;
  meta?: ResponseMeta;
  correlationId: string;
  /** HTTP status (202 = accepted for maker–checker approval). */
  status: number;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

/** "?a=1&b=2" for a request's query, or "" when it has none. */
function querySuffix(query: ApiRequestInit['query']): string {
  const params =
    query instanceof URLSearchParams
      ? query
      : new URLSearchParams(
          Object.entries(query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        );
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function requestHeaders(
  method: string,
  init: ApiRequestInit,
  correlationId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-correlation-id': correlationId,
    'x-requested-with': 'appcore',
    ...init.headers,
  };
  if (init.background) headers['x-appcore-background'] = '1';
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }
  return headers;
}

/** Why a request got no response, with what the user is told. */
const TRANSPORT_FAILURES = {
  ABORTED: 'The request was cancelled.',
  TIMEOUT: 'The request timed out. Please try again.',
  NETWORK_ERROR: 'You appear to be offline. Check your connection and try again.',
} as const;

function transportFailure(aborted: boolean, timedOut: boolean): keyof typeof TRANSPORT_FAILURES {
  if (aborted) return 'ABORTED';
  return timedOut ? 'TIMEOUT' : 'NETWORK_ERROR';
}

/**
 * Browser → BFF request helper used by feature hooks (never by components
 * directly). Same-origin only; sends the CSRF token for state-changing calls;
 * normalises every failure into ApiClientError and broadcasts session expiry.
 */
export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
  const method = init.method ?? 'GET';
  const correlationId = globalThis.crypto.randomUUID();
  const url = `${path}${querySuffix(init.query)}`;
  const headers = requestHeaders(method, init, correlationId);

  const timeout = AbortSignal.timeout(init.timeoutMs ?? 30_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    const code = transportFailure(!!init.signal?.aborted, timeout.aborted);
    throw new ApiClientError({
      code,
      message: TRANSPORT_FAILURES[code],
      status: 0,
      correlationId,
      cause: error,
    });
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* handled below */
  }

  if (!res.ok || isApiErrorResponse(payload)) {
    const error = isApiErrorResponse(payload)
      ? ApiClientError.fromEnvelope(payload, res.status, res.headers.get('retry-after'))
      : new ApiClientError({
          code: 'UNKNOWN_ERROR',
          message: 'Something went wrong.',
          status: res.status,
          correlationId,
        });
    if (error.endsSession && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { code: error.code } }),
      );
    }
    throw error;
  }

  const envelope = payload as ApiSuccessResponse<T>;
  return {
    data: envelope.data,
    message: envelope.message,
    meta: envelope.meta,
    correlationId: envelope.correlationId,
    status: res.status,
  };
}
