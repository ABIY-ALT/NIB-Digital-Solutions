import { randomInt } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import type {
  ExternalApiClient,
  ExternalRequest,
  ExternalResponse,
} from '#core/application/ports/external-api.port.js';
import { ExternalServiceError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { RequestContext } from '../context/request-context.js';
import { CircuitBreaker, CircuitOpenError, type CircuitBreakerOptions } from './circuit-breaker.js';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** HTTP statuses considered transient. */
  retryOnStatus: number[];
}

export interface ExternalApiClientOptions {
  name: string;
  baseUrl: string;
  timeoutMs: number;
  defaultHeaders?: Record<string, string>;
  retry?: Partial<RetryPolicy>;
  circuitBreaker?: Partial<CircuitBreakerOptions>;
  /** Called before each request (e.g. attach a fresh OAuth token). */
  authenticate?: () => Promise<Record<string, string>> | Record<string, string>;
}

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2_000,
  retryOnStatus: [408, 425, 429, 500, 502, 503, 504],
};

const DEFAULT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThreshold: 1,
};

const IDEMPOTENT_METHODS = new Set(['GET', 'PUT', 'DELETE']);

class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Upstream responded with HTTP ${status}`);
  }
}

/**
 * The single, centralized client for calling external systems (T24 core
 * banking, payment gateways, ...). Every call gets:
 *   • a timeout (AbortSignal)          • retries with exponential backoff + jitter
 *   • a circuit breaker per system     • correlation-id propagation
 *   • structured logging (no bodies)   • errors normalised to ExternalServiceError
 *
 * Non-idempotent methods (POST/PATCH) are NOT retried unless `retryable: true`.
 */
export class HttpExternalApiClient implements ExternalApiClient {
  readonly name: string;
  private readonly logger: Logger;
  private readonly retry: RetryPolicy;
  private readonly breaker: CircuitBreaker;

  constructor(private readonly options: ExternalApiClientOptions) {
    this.name = options.name;
    this.logger = new Logger(`ExternalApi:${options.name}`);
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.breaker = new CircuitBreaker(
      options.name,
      { ...DEFAULT_BREAKER, ...options.circuitBreaker },
      (name, from, to) =>
        this.logger.warn({ circuit: name, from, to }, 'Circuit breaker state changed'),
    );
  }

  get circuitState(): string {
    return this.breaker.currentState;
  }

  async request<T>(req: ExternalRequest): Promise<ExternalResponse<T>> {
    const retryable = req.retryable ?? IDEMPOTENT_METHODS.has(req.method);
    const attempts = retryable ? this.retry.maxAttempts : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.breaker.execute(() => this.send<T>(req, attempt));
      } catch (error) {
        lastError = error;
        if (error instanceof CircuitOpenError) break;
        const transient =
          error instanceof HttpStatusError ? this.retry.retryOnStatus.includes(error.status) : true; // network error / timeout
        if (!transient || attempt === attempts || req.signal?.aborted) break;
        const backoff = Math.min(
          this.retry.maxDelayMs,
          this.retry.baseDelayMs * 2 ** (attempt - 1),
        );
        // Jitter: a random delay in [backoff / 2, backoff).
        await sleep(backoff / 2 + randomInt(Math.max(1, Math.ceil(backoff / 2))));
      }
    }
    throw this.normalise(lastError);
  }

  async withFallback<T>(
    primary: () => Promise<T>,
    fallback: (error: unknown) => T | Promise<T>,
  ): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      this.logger.warn({ err: error }, 'Primary call failed; using fallback');
      return fallback(error);
    }
  }

  private async send<T>(req: ExternalRequest, attempt: number): Promise<ExternalResponse<T>> {
    const url = new URL(
      req.path.replace(/^\//, ''),
      this.options.baseUrl.endsWith('/') ? this.options.baseUrl : `${this.options.baseUrl}/`,
    );
    for (const [k, v] of Object.entries(req.query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v));

    const correlationId = RequestContext.get()?.correlationId;
    const auth = this.options.authenticate ? await this.options.authenticate() : {};
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      ...this.options.defaultHeaders,
      ...auth,
      ...req.headers,
    };

    const timeout = AbortSignal.timeout(req.timeoutMs ?? this.options.timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    const started = performance.now();

    const res = await fetch(url, {
      method: req.method,
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal,
    });
    const durationMs = Math.round(performance.now() - started);
    const text = await res.text();
    const data = (text ? safeJson(text) : undefined) as T;

    this.logger.log(
      { method: req.method, path: url.pathname, status: res.status, durationMs, attempt },
      'External call completed',
    );

    if (!res.ok) throw new HttpStatusError(res.status, data);
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      data,
      durationMs,
    };
  }

  private normalise(error: unknown): ExternalServiceError {
    if (error instanceof ExternalServiceError) return error;
    if (error instanceof CircuitOpenError) {
      return new ExternalServiceError(ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE, this.name, error);
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return new ExternalServiceError(ErrorCode.EXTERNAL_SERVICE_TIMEOUT, this.name, error);
    }
    return new ExternalServiceError(ErrorCode.EXTERNAL_SERVICE_ERROR, this.name, error);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
