import {
  errorKindOf,
  SESSION_ENDING_CODES,
  type ApiErrorResponse,
  type ErrorKind,
  type FieldIssue,
} from '@/shared/types';

/**
 * Normalised error used everywhere above the transport: BFF route handlers,
 * server components, TanStack Query hooks and error boundaries all see the same
 * shape, always carrying the correlation id for log tracing.
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly correlationId: string | null;
  readonly details?: Record<string, unknown> | FieldIssue[];
  readonly retryAfterSeconds?: number;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    correlationId?: string | null;
    details?: Record<string, unknown> | FieldIssue[];
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = 'ApiClientError';
    this.code = init.code;
    this.status = init.status;
    this.correlationId = init.correlationId ?? null;
    this.details = init.details;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  get kind(): ErrorKind {
    return errorKindOf(this.code, this.status);
  }

  /** True when the user must sign in again. */
  get endsSession(): boolean {
    return SESSION_ENDING_CODES.has(this.code);
  }

  /** Field errors (for form error mapping), if any. */
  get fieldIssues(): FieldIssue[] {
    return Array.isArray(this.details) ? this.details : [];
  }

  static fromEnvelope(
    body: ApiErrorResponse,
    status: number,
    retryAfter?: string | null,
  ): ApiClientError {
    return new ApiClientError({
      code: body.error.code,
      message: body.error.message,
      status,
      correlationId: body.correlationId,
      details: body.error.details,
      retryAfterSeconds: retryAfter ? Number(retryAfter) || undefined : undefined,
    });
  }

  toEnvelope(path?: string): ApiErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
      correlationId: this.correlationId ?? 'unknown',
      timestamp: new Date().toISOString(),
      ...(path ? { path } : {}),
    };
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiClientError || (error instanceof Error && error.name === 'ApiClientError')
  );
}
