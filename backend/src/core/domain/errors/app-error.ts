import { DefaultErrorMessages, ErrorCode } from './error-codes.js';

/** A single field-level problem, safe to return to callers. */
export interface FieldIssue {
  field: string;
  message: string;
  code?: string;
}

export interface AppErrorOptions {
  message?: string;
  /** Safe, caller-visible details (never stack traces, SQL or secrets). */
  details?: Record<string, unknown> | FieldIssue[];
  /** Original error, logged server-side only. */
  cause?: unknown;
}

/**
 * Root of the AppCore exception hierarchy. Framework-free so any layer can throw
 * it; the global exception filter maps `code` to an HTTP status.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown> | FieldIssue[];

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? DefaultErrorMessages[code], { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(issues: FieldIssue[], message?: string) {
    super(ErrorCode.VALIDATION_FAILED, { message, details: issues });
  }
}

export class BadRequestError extends AppError {
  constructor(message?: string, details?: Record<string, unknown>) {
    super(ErrorCode.BAD_REQUEST, { message, details });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(ErrorCode.NOT_FOUND, {
      message: `${resource} was not found.`,
      details: id ? { resource, id } : { resource },
    });
  }
}

export class ConflictError extends AppError {
  constructor(message?: string, details?: Record<string, unknown>) {
    super(ErrorCode.CONFLICT, { message, details });
  }
}

/** Raised when an update targets a stale `version` (optimistic concurrency). */
export class ConcurrencyError extends AppError {
  constructor(resource: string, id: string, expectedVersion: number) {
    super(ErrorCode.CONCURRENCY_CONFLICT, { details: { resource, id, expectedVersion } });
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, rule?: string) {
    super(ErrorCode.BUSINESS_RULE_VIOLATION, { message, details: rule ? { rule } : undefined });
  }
}

export class AuthenticationError extends AppError {
  constructor(code: ErrorCode = ErrorCode.UNAUTHENTICATED, options: AppErrorOptions = {}) {
    super(code, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message?: string, details?: Record<string, unknown>) {
    super(ErrorCode.FORBIDDEN, { message, details });
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds?: number) {
    super(ErrorCode.RATE_LIMITED, {
      details: retryAfterSeconds ? { retryAfterSeconds } : undefined,
    });
  }
}

export class IdempotencyError extends AppError {}

export class ExternalServiceError extends AppError {
  constructor(
    code:
      | typeof ErrorCode.EXTERNAL_SERVICE_ERROR
      | typeof ErrorCode.EXTERNAL_SERVICE_TIMEOUT
      | typeof ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
    service: string,
    cause?: unknown,
  ) {
    super(code, { details: { service }, cause });
  }
}

export class SecurityError extends AppError {}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
