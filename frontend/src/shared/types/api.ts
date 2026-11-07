/**
 * API contracts shared by the BFF, the browser and (by convention) the backend.
 * They mirror the NestJS response envelope exactly.
 */

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

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string | null;
  meta?: ResponseMeta;
  correlationId: string;
  timestamp: string;
}

export interface FieldIssue {
  field: string;
  message: string;
  code?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown> | FieldIssue[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
  correlationId: string;
  timestamp: string;
  path?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** A page of items as consumed by UI hooks. */
export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  field: string;
  direction: SortDirection;
}

/** Standard list query (mirrors the backend list query syntax). */
export interface ListParams {
  page?: number;
  pageSize?: number;
  sort?: SortState[];
  search?: string;
  /** filter[field] = value | "<op>:<value>" */
  filters?: Record<string, string | undefined>;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { error?: { code?: unknown } }).error?.code === 'string'
  );
}

/** Serialises ListParams into the backend query-string syntax. */
export function toListQuery(params: ListParams = {}): URLSearchParams {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.sort?.length)
    q.set('sort', params.sort.map((s) => `${s.field}:${s.direction}`).join(','));
  if (params.search?.trim()) q.set('search', params.search.trim());
  for (const [field, value] of Object.entries(params.filters ?? {})) {
    if (value !== undefined && value !== '') q.set(`filter[${field}]`, value);
  }
  return q;
}
