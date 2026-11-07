/**
 * Standard pagination model used by every list endpoint.
 * Framework-free: the presentation layer parses query strings into a PageRequest,
 * repositories translate it into queries, and use cases return a Page<T>.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  field: string;
  direction: SortDirection;
}

export type FilterOperator = 'eq' | 'ne' | 'in' | 'gte' | 'lte' | 'gt' | 'lt' | 'contains';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: string | string[];
}

export interface PageRequest {
  page: number;
  pageSize: number;
  sort: SortSpec[];
  search?: string;
  filters: FilterCondition[];
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
} as const;

export function createPage<T>(
  items: T[],
  totalItems: number,
  request: Pick<PageRequest, 'page' | 'pageSize'>,
): Page<T> {
  const totalPages = Math.max(1, Math.ceil(totalItems / request.pageSize));
  return {
    items,
    page: request.page,
    pageSize: request.pageSize,
    totalItems,
    totalPages,
    hasNextPage: request.page < totalPages,
    hasPreviousPage: request.page > 1,
  };
}

export function mapPage<T, R>(page: Page<T>, fn: (item: T) => R): Page<R> {
  return { ...page, items: page.items.map(fn) };
}

export function pageOffset(request: Pick<PageRequest, 'page' | 'pageSize'>): number {
  return (request.page - 1) * request.pageSize;
}
