import type { FieldIssue } from '#core/domain/errors/app-error.js';
import type { Page } from '#core/domain/pagination.js';

/** Pagination metadata returned by every list endpoint. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ResponseMeta {
  pagination?: PaginationMeta;
  [key: string]: unknown;
}

/** Standard success envelope. */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string | null;
  meta?: ResponseMeta;
  correlationId: string;
  timestamp: string;
}

/** Standard error envelope. `details` only ever contains safe information. */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | FieldIssue[];
  };
  correlationId: string;
  timestamp: string;
  path: string;
}

/**
 * What controllers return. The ResponseEnvelopeInterceptor turns it into an
 * ApiSuccessResponse and stamps the correlation id + timestamp.
 */
export class ApiResult<T> {
  constructor(
    readonly data: T,
    readonly message: string | null = null,
    readonly meta?: ResponseMeta,
    /** Overrides the handler's HTTP status (e.g. 202 when a change awaits approval). */
    readonly status?: number,
  ) {}

  /** 202 Accepted: the request was recorded but takes effect later (maker–checker). */
  static accepted<T>(data: T, message?: string, meta?: ResponseMeta): ApiResult<T> {
    return new ApiResult(data, message ?? null, meta, 202);
  }

  static ok<T>(data: T, message?: string): ApiResult<T> {
    return new ApiResult(data, message ?? null);
  }

  static paginated<T>(page: Page<T>, message?: string): ApiResult<T[]> {
    const { items, ...pagination } = page;
    return new ApiResult(items, message ?? null, { pagination });
  }

  static empty(message?: string): ApiResult<null> {
    return new ApiResult(null, message ?? null);
  }
}
