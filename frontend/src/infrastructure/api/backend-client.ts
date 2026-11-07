import { randomInt, randomUUID } from 'node:crypto';
import {
  decryptPayload,
  ENCRYPTION_HEADER,
  encryptPayload,
  isEncryptedBody,
  requestPurpose,
  responsePurpose,
  type KeyRing,
} from '@/infrastructure/security/payload-crypto';
import { SignatureHeaders, signRequest } from '@/infrastructure/security/request-signature';
import { isApiErrorResponse, type ApiSuccessResponse, type ResponseMeta } from '@/shared/types';
import { ApiClientError } from '@/shared/errors/api-client-error';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Per-request metadata forwarded to the backend (from the incoming browser request). */
export interface RequestMeta {
  correlationId?: string;
  clientIp?: string;
  userAgent?: string;
}

export interface BackendClientOptions {
  /** e.g. http://localhost:4000 */
  baseUrl: string;
  /** e.g. /api/v1 */
  apiPrefix: string;
  /** BFF service identity (HMAC). */
  clientId: string;
  clientSecret: string;
  /** Application-level payload encryption (optional second layer over TLS). */
  encryption?: { enabled: boolean; keyRing: KeyRing };
  timeoutMs?: number;
  /** Retries for idempotent requests (GET, or any request with an idempotency key). */
  retries?: number;
  logger?: Logger;
  /** Supplies correlation id / client IP / UA of the current incoming request. */
  requestMeta?: () => Promise<RequestMeta> | RequestMeta;
}

export interface BackendRequest {
  method: HttpMethod;
  /** Path relative to apiPrefix, e.g. "/users" or "/auth/login". */
  path: string;
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** End-user access token (from the encrypted session). */
  accessToken?: string;
  /** Makes non-GET requests retryable and deduplicated by the backend. */
  idempotencyKey?: string;
  /**
   * Extra informational headers (e.g. x-change-reason). They can never replace
   * the security headers set by the client (signature, auth, encryption).
   */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  /** Override encryption for this call. */
  encrypt?: boolean;
  /** Explicit request metadata (e.g. from proxy.ts, where next/headers is unavailable). */
  meta?: RequestMeta;
}

export interface BackendResult<T> {
  data: T;
  message: string | null;
  meta?: ResponseMeta;
  correlationId: string;
  status: number;
}

/** Per-call options of the verb helpers (the method, path and body are their arguments). */
type RequestOptions = Omit<BackendRequest, 'method' | 'path' | 'body'>;
/** The same, for a client already bound to an access token. */
type BoundRequestOptions = Omit<RequestOptions, 'accessToken'>;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** Why a request got no response: what the caller sees and the status it maps to. */
const TRANSPORT_FAILURES = {
  ABORTED: { status: 499, message: 'The request was cancelled.' },
  TIMEOUT: { status: 504, message: 'The server took too long to respond.' },
  NETWORK_ERROR: { status: 503, message: 'The service is unreachable.' },
} as const;

/**
 * Centralized BFF → backend client. Every call gets:
 *   • BFF service identity (HMAC signature, nonce, timestamp)
 *   • optional AES-256-GCM payload encryption (request + response)
 *   • correlation id + end-user IP/UA forwarding
 *   • timeout, cancellation (AbortSignal) and retries with backoff for idempotent calls
 *   • error normalisation to ApiClientError and response unwrapping
 */
export class BackendClient {
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(private readonly options: BackendClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retries = options.retries ?? 2;
  }

  get<T>(path: string, init: RequestOptions = {}): Promise<BackendResult<T>> {
    return this.request<T>({ ...init, method: 'GET', path });
  }

  post<T>(path: string, body?: unknown, init: RequestOptions = {}): Promise<BackendResult<T>> {
    return this.request<T>({ ...init, method: 'POST', path, body });
  }

  patch<T>(path: string, body?: unknown, init: RequestOptions = {}): Promise<BackendResult<T>> {
    return this.request<T>({ ...init, method: 'PATCH', path, body });
  }

  put<T>(path: string, body?: unknown, init: RequestOptions = {}): Promise<BackendResult<T>> {
    return this.request<T>({ ...init, method: 'PUT', path, body });
  }

  delete<T>(path: string, init: RequestOptions = {}): Promise<BackendResult<T>> {
    return this.request<T>({ ...init, method: 'DELETE', path });
  }

  /** Returns a client bound to an end-user access token. */
  as(accessToken: string): BoundBackendClient {
    return new BoundBackendClient(this, accessToken);
  }

  async request<T>(req: BackendRequest): Promise<BackendResult<T>> {
    const meta = req.meta ?? (await this.options.requestMeta?.()) ?? {};
    const correlationId = meta.correlationId ?? randomUUID();
    const idempotent = req.method === 'GET' || !!req.idempotencyKey;
    const maxAttempts = idempotent ? (req.retries ?? this.retries) + 1 : 1;
    let lastError: ApiClientError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.send<T>(req, correlationId, meta, attempt);
      } catch (error) {
        lastError = error instanceof ApiClientError ? error : this.unknown(error, correlationId);
        const transient =
          lastError.code === 'NETWORK_ERROR' ||
          lastError.code === 'TIMEOUT' ||
          RETRYABLE_STATUS.has(lastError.status);
        if (!transient || attempt === maxAttempts || req.signal?.aborted) break;
        const retryAfterMs = (lastError.retryAfterSeconds ?? 0) * 1000;
        const backoff = Math.min(4_000, 200 * 2 ** (attempt - 1));
        const delay = Math.max(retryAfterMs, backoff / 2 + randomInt(backoff / 2));
        if (delay > 5_000) break; // do not hold the user's request hostage
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError ?? this.unknown(new Error('Request failed'), correlationId);
  }

  private async send<T>(
    req: BackendRequest,
    correlationId: string,
    meta: RequestMeta,
    attempt: number,
  ): Promise<BackendResult<T>> {
    const { baseUrl, apiPrefix, encryption, logger } = this.options;
    const pathWithQuery = `${apiPrefix}${req.path}${querySuffix(req.query)}`;
    const encrypt = (req.encrypt ?? encryption?.enabled ?? false) && !!encryption;
    const wireBody = this.wireBody(req, pathWithQuery, encrypt);
    const headers = this.headers(req, { pathWithQuery, wireBody, encrypt, correlationId, meta });

    const timeout = AbortSignal.timeout(req.timeoutMs ?? this.timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    const started = performance.now();

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${pathWithQuery}`, {
        method: req.method,
        headers,
        body: wireBody,
        signal,
        cache: 'no-store',
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      const failure = transportFailure(!!req.signal?.aborted, timeout.aborted);
      logger?.warn(
        {
          method: req.method,
          path: req.path,
          correlationId,
          attempt,
          durationMs,
          err: String(error),
        },
        'Backend call failed',
      );
      throw new ApiClientError({
        code: failure,
        ...TRANSPORT_FAILURES[failure],
        correlationId,
        cause: error,
      });
    }

    const durationMs = Math.round(performance.now() - started);
    const payload = await this.readPayload(res, req, correlationId);
    logger?.[logLevel(res.status)](
      {
        method: req.method,
        path: req.path,
        status: res.status,
        durationMs,
        attempt,
        correlationId,
      },
      'Backend call',
    );
    return unwrap<T>(res, payload, correlationId);
  }

  /** The JSON body as sent: encrypted, bound to the method and path, when encryption applies. */
  private wireBody(
    req: BackendRequest,
    pathWithQuery: string,
    encrypt: boolean,
  ): string | undefined {
    if (req.body === undefined) return undefined;
    const json = JSON.stringify(req.body);
    if (!encrypt) return json;
    const ring = this.options.encryption!.keyRing;
    const key = ring.keys.get(ring.activeKeyId)!;
    return JSON.stringify({
      enc: encryptPayload(json, key, ring.activeKeyId, requestPurpose(req.method, pathWithQuery)),
    });
  }

  /** The signed service identity, the forwarded user context and the per-call headers. */
  private headers(
    req: BackendRequest,
    call: {
      pathWithQuery: string;
      wireBody: string | undefined;
      encrypt: boolean;
      correlationId: string;
      meta: RequestMeta;
    },
  ): Record<string, string> {
    const { clientId, clientSecret } = this.options;
    const { pathWithQuery, wireBody, correlationId, meta } = call;
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const clientIp = meta.clientIp ?? '';
    const headers: Record<string, string> = {
      ...req.headers,
      accept: 'application/json',
      [SignatureHeaders.clientId]: clientId,
      [SignatureHeaders.timestamp]: timestamp,
      [SignatureHeaders.nonce]: nonce,
      [SignatureHeaders.clientIp]: clientIp,
      [SignatureHeaders.correlationId]: correlationId,
      [SignatureHeaders.signature]: signRequest(
        {
          method: req.method,
          pathWithQuery,
          timestamp,
          nonce,
          correlationId,
          clientIp,
          body: wireBody,
        },
        clientSecret,
      ),
    };
    if (meta.userAgent) headers[SignatureHeaders.clientUserAgent] = meta.userAgent.slice(0, 512);
    if (wireBody !== undefined) headers['content-type'] = 'application/json';
    if (call.encrypt) headers[ENCRYPTION_HEADER] = '1';
    if (req.accessToken) headers.authorization = `Bearer ${req.accessToken}`;
    if (req.idempotencyKey) headers['idempotency-key'] = req.idempotencyKey;
    return headers;
  }

  /** The response body as JSON, decrypted when the backend encrypted it. */
  private async readPayload(
    res: Response,
    req: BackendRequest,
    correlationId: string,
  ): Promise<unknown> {
    const { encryption, logger } = this.options;
    try {
      const text = await res.text();
      let payload: unknown = text ? (JSON.parse(text) as unknown) : null;
      if (res.headers.get(ENCRYPTION_HEADER) === '1' && isEncryptedBody(payload) && encryption) {
        const key = encryption.keyRing.keys.get(payload.enc.kid);
        if (!key) throw new Error(`Unknown response key id ${payload.enc.kid}`);
        payload = JSON.parse(
          decryptPayload(payload.enc, key, responsePurpose(correlationId)),
        ) as unknown;
      }
      return payload;
    } catch (error) {
      logger?.error(
        {
          method: req.method,
          path: req.path,
          status: res.status,
          correlationId,
          err: String(error),
        },
        'Invalid backend response',
      );
      throw new ApiClientError({
        code: 'INVALID_RESPONSE',
        message: 'The server returned an invalid response.',
        status: 502,
        correlationId,
        cause: error,
      });
    }
  }

  private unknown(error: unknown, correlationId: string): ApiClientError {
    return new ApiClientError({
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred.',
      status: 500,
      correlationId,
      cause: error,
    });
  }
}

/** Convenience wrapper that attaches the user's access token to every call. */
export class BoundBackendClient {
  constructor(
    private readonly client: BackendClient,
    private readonly accessToken: string,
  ) {}

  get<T>(path: string, init: BoundRequestOptions = {}): Promise<BackendResult<T>> {
    return this.client.get<T>(path, { ...init, accessToken: this.accessToken });
  }
  post<T>(path: string, body?: unknown, init: BoundRequestOptions = {}): Promise<BackendResult<T>> {
    return this.client.post<T>(path, body, { ...init, accessToken: this.accessToken });
  }
  patch<T>(
    path: string,
    body?: unknown,
    init: BoundRequestOptions = {},
  ): Promise<BackendResult<T>> {
    return this.client.patch<T>(path, body, { ...init, accessToken: this.accessToken });
  }
  put<T>(path: string, body?: unknown, init: BoundRequestOptions = {}): Promise<BackendResult<T>> {
    return this.client.put<T>(path, body, { ...init, accessToken: this.accessToken });
  }
  delete<T>(path: string, init: BoundRequestOptions = {}): Promise<BackendResult<T>> {
    return this.client.delete<T>(path, { ...init, accessToken: this.accessToken });
  }
}

/** "?a=1&b=2" for a request's query, or "" when it has none. */
function querySuffix(query: BackendRequest['query']): string {
  const qs = (query instanceof URLSearchParams ? query : toSearchParams(query)).toString();
  return qs ? `?${qs}` : '';
}

function transportFailure(aborted: boolean, timedOut: boolean): keyof typeof TRANSPORT_FAILURES {
  if (aborted) return 'ABORTED';
  return timedOut ? 'TIMEOUT' : 'NETWORK_ERROR';
}

/** Server errors are logged as errors, client errors as warnings, the rest as info. */
function logLevel(status: number): 'error' | 'warn' | 'info' {
  if (status >= 500) return 'error';
  return status >= 400 ? 'warn' : 'info';
}

/** The data of a success envelope; error envelopes and unexpected bodies are thrown. */
function unwrap<T>(res: Response, payload: unknown, correlationId: string): BackendResult<T> {
  if (isApiErrorResponse(payload))
    throw ApiClientError.fromEnvelope(payload, res.status, res.headers.get('retry-after'));
  if (!res.ok) {
    throw new ApiClientError({
      code: res.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
      message: 'The request failed.',
      status: res.status,
      correlationId,
    });
  }
  const envelope = payload as ApiSuccessResponse<T> | null;
  if (envelope?.success !== true) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: 'The server returned an unexpected response.',
      status: 502,
      correlationId,
    });
  }
  return {
    data: envelope.data,
    message: envelope.message,
    meta: envelope.meta,
    correlationId: envelope.correlationId ?? correlationId,
    status: res.status,
  };
}

function toSearchParams(
  query?: Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) params.set(k, String(v));
  return params;
}
