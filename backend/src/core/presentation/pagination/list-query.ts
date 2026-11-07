import { applyDecorators, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';
import {
  PAGINATION_DEFAULTS,
  type FilterCondition,
  type FilterOperator,
  type PageRequest,
  type SortSpec,
} from '#core/domain/pagination.js';

/**
 * Declares what a list endpoint supports. Every list endpoint accepts the same
 * query syntax:
 *
 *   ?page=1&pageSize=20
 *   &sort=createdAt:desc,username:asc      (or "-createdAt,username")
 *   &search=abebe
 *   &filter[status]=ACTIVE                 (eq)
 *   &filter[status]=in:ACTIVE,LOCKED       (in)
 *   &filter[createdAt]=gte:2025-01-01      (eq|ne|in|gt|gte|lt|lte|contains)
 *   &filter[createdAt]=between:2025-01-01,2025-01-31   (→ gte + lte; either end may be empty)
 */
export interface ListQuerySpec {
  sortable: readonly string[];
  filterable: readonly string[];
  searchable?: boolean;
  maxPageSize?: number;
  defaultPageSize?: number;
}

const OPERATORS: readonly FilterOperator[] = [
  'eq',
  'ne',
  'in',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
];
const FILTER_KEY = /^filter\[([A-Za-z0-9_.]+)\]$/;

function first(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0] as string | undefined;
  return typeof v === 'string' ? v : undefined;
}

export function parseListQuery(query: Record<string, unknown>, spec: ListQuerySpec): PageRequest {
  const issues: FieldIssue[] = [];
  const maxPageSize = spec.maxPageSize ?? PAGINATION_DEFAULTS.maxPageSize;
  const page = parseInteger(query, 'page', issues, {
    fallback: PAGINATION_DEFAULTS.page,
    min: 1,
    max: 1_000_000,
  });
  const pageSize = parseInteger(query, 'pageSize', issues, {
    fallback: spec.defaultPageSize ?? PAGINATION_DEFAULTS.pageSize,
    min: 1,
    max: maxPageSize,
  });
  const sort = parseSort(first(query['sort']), spec.sortable, issues);
  const search = parseSearch(first(query['search'])?.trim(), spec.searchable, issues);
  const filters = parseFilters(query, spec.filterable, issues);

  if (issues.length > 0) throw new ValidationError(issues, 'Invalid list query parameters.');
  return { page, pageSize, sort, search, filters };
}

function parseInteger(
  query: Record<string, unknown>,
  name: string,
  issues: FieldIssue[],
  { fallback, min, max }: { fallback: number; min: number; max: number },
): number {
  const raw = first(query[name]);
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    issues.push({ field: name, message: `must be an integer between ${min} and ${max}` });
    return fallback;
  }
  return n;
}

function parseSort(
  raw: string | undefined,
  sortable: readonly string[],
  issues: FieldIssue[],
): SortSpec[] {
  const sort: SortSpec[] = [];
  if (!raw) return sort;
  for (const part of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)) {
    const { field, direction } = parseSortPart(part, issues);
    if (!sortable.includes(field))
      issues.push({ field: 'sort', message: `cannot sort by "${field}"` });
    else sort.push({ field, direction });
  }
  return sort;
}

/** `-field` (descending), `field:asc|desc` or `field` (ascending). */
function parseSortPart(part: string, issues: FieldIssue[]): SortSpec {
  if (part.startsWith('-')) return { field: part.slice(1), direction: 'desc' };
  if (!part.includes(':')) return { field: part, direction: 'asc' };
  const [field = '', direction] = part.split(':');
  if (direction === 'asc' || direction === 'desc') return { field, direction };
  issues.push({ field: 'sort', message: `invalid direction "${direction}"` });
  return { field, direction: 'asc' };
}

function parseSearch(
  raw: string | undefined,
  searchable: boolean | undefined,
  issues: FieldIssue[],
): string | undefined {
  if (!raw) return undefined;
  if (!searchable) {
    issues.push({ field: 'search', message: 'search is not supported here' });
    return undefined;
  }
  if (raw.length > 100) {
    issues.push({ field: 'search', message: 'must be at most 100 characters' });
    return undefined;
  }
  return raw;
}

function parseFilters(
  query: Record<string, unknown>,
  filterable: readonly string[],
  issues: FieldIssue[],
): FilterCondition[] {
  const given: Array<[field: string, raw: string]> = [];
  for (const [key, raw] of Object.entries(query)) {
    const field = FILTER_KEY.exec(key)?.[1];
    const value = first(raw);
    if (field && value !== undefined) given.push([field, value]);
  }
  // Also support qs-style nested parsing: { filter: { status: 'ACTIVE' } }
  const nested = query['filter'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const [field, raw] of Object.entries(nested as Record<string, unknown>)) {
      const value = first(raw);
      if (value !== undefined) given.push([field, value]);
    }
  }
  return given.flatMap(([field, raw]) => {
    if (filterable.includes(field)) return parseFilter(field, raw, issues);
    issues.push({ field: `filter[${field}]`, message: 'unknown filter field' });
    return [];
  });
}

/** `value`, `<op>:<value>` or `between:<from>,<to>`. */
function parseFilter(field: string, raw: string, issues: FieldIssue[]): FilterCondition[] {
  if (raw.startsWith('between:')) {
    return parseBetween(field, raw.slice('between:'.length), issues);
  }
  const idx = raw.indexOf(':');
  const maybeOp = idx > 0 ? raw.slice(0, idx) : '';
  const operator = (OPERATORS as readonly string[]).includes(maybeOp)
    ? (maybeOp as FilterOperator)
    : 'eq';
  const value = operator === 'eq' && !maybeOp ? raw : raw.slice(idx + 1);
  if (value.length > 200) {
    issues.push({ field: `filter[${field}]`, message: 'value too long' });
    return [];
  }
  return [
    {
      field,
      operator,
      value:
        operator === 'in'
          ? value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
              .slice(0, 200)
          : value,
    },
  ];
}

/** `from,to` → gte + lte; either end may be empty. */
function parseBetween(field: string, range: string, issues: FieldIssue[]): FilterCondition[] {
  const parts = range.split(',');
  const [from = '', to = ''] = parts.map((p) => p.trim());
  if (parts.length !== 2 || (!from && !to) || from.length > 100 || to.length > 100) {
    issues.push({
      field: `filter[${field}]`,
      message: 'between expects "from,to" (one side may be empty)',
    });
    return [];
  }
  const conditions: FilterCondition[] = [];
  if (from) conditions.push({ field, operator: 'gte', value: from });
  if (to) conditions.push({ field, operator: 'lte', value: to });
  return conditions;
}

/** Parameter decorator: parses and validates list query params into a PageRequest. */
export const ListQuery = createParamDecorator(
  (spec: ListQuerySpec, ctx: ExecutionContext): PageRequest => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return parseListQuery(req.query, spec);
  },
);

/** Swagger documentation for the standard list query parameters. */
export function ApiListQuery(spec: ListQuerySpec): MethodDecorator {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 }),
    ApiQuery({
      name: 'sort',
      required: false,
      type: String,
      description: `Comma separated. Fields: ${spec.sortable.join(', ')}. e.g. "createdAt:desc" or "-createdAt"`,
    }),
    ...(spec.searchable ? [ApiQuery({ name: 'search', required: false, type: String })] : []),
    ...spec.filterable.map((f) =>
      ApiQuery({
        name: `filter[${f}]`,
        required: false,
        type: String,
        description: 'Value or "<op>:<value>" where op ∈ eq|ne|in|gt|gte|lt|lte|contains',
      }),
    ),
  );
}
