import type { ListDefaults } from '@/shared/lib/list-params';
import type { ListParams, Paginated, ResponseMeta } from '@/shared/types';

/**
 * Data-access layer — the resource definition.
 *
 * A feature declares each REST resource ONCE, in a plain module (no 'use client'),
 * so the same definition drives:
 *   • query keys          (client hooks, invalidation, server prefetch + hydration)
 *   • client hooks        createResourceHooks()   — shared/data/resource-hooks.ts
 *   • BFF route handlers  resourceRoutes()        — features/auth/api/resource-routes.ts
 *   • server prefetch     listQuery()/detailQuery() — features/auth/api/prefetch.tsx
 *
 *   export const rolesResource = defineResource<Role>({
 *     name: 'roles', apiPath: '/api/roles', backendPath: '/roles',
 *     listDefaults: { pageSize: 20, sort: [{ field: 'name', direction: 'asc' }] },
 *   });
 */
export interface ResourceConfig {
  /** Unique cache namespace (first query-key segment). */
  name: string;
  /** Browser → BFF base path. */
  apiPath: string;
  /** BFF → backend base path (server-side only use). */
  backendPath: string;
  /** Defaults for list screens: URL parsing, hooks and prefetch all use them. */
  listDefaults?: ListDefaults;
}

export interface ResourceKeys {
  all: readonly [string];
  lists: () => readonly [string, 'list'];
  list: (params: ListParams) => readonly [string, 'list', ListParams];
  details: () => readonly [string, 'detail'];
  detail: (id: string) => readonly [string, 'detail', string];
  /** Custom sub-keys (e.g. keys.scope('all') for an unpaginated picker list). */
  scope: (...parts: unknown[]) => readonly unknown[];
}

export interface Resource<T> extends Required<
  Pick<ResourceConfig, 'name' | 'apiPath' | 'backendPath'>
> {
  listDefaults: ListDefaults;
  keys: ResourceKeys;
  /** Phantom type carrier (never read at runtime). */
  readonly __type?: T;
}

export function createQueryKeys(name: string): ResourceKeys {
  return {
    all: [name] as const,
    lists: () => [name, 'list'] as const,
    list: (params) => [name, 'list', normaliseParams(params)] as const,
    details: () => [name, 'detail'] as const,
    detail: (id) => [name, 'detail', id] as const,
    scope: (...parts) => [name, ...parts] as const,
  };
}

export function defineResource<T>(config: ResourceConfig): Resource<T> {
  return {
    name: config.name,
    apiPath: config.apiPath.replace(/\/$/, ''),
    backendPath: config.backendPath.replace(/\/$/, ''),
    listDefaults: config.listDefaults ?? {},
    keys: createQueryKeys(config.name),
  };
}

/**
 * Canonical ListParams for query keys: drops empty values so `{ search: '' }`
 * and `{}` hit the same cache entry on the server and in the browser.
 */
export function normaliseParams(params: ListParams): ListParams {
  const filters = Object.fromEntries(
    Object.entries(params.filters ?? {}).filter(([, v]) => v !== undefined && v !== ''),
  );
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize,
    ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    ...(params.sort?.length ? { sort: params.sort } : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
  };
}

/** Standard envelope (data + meta.pagination) → the Paginated<T> shape list hooks return. */
export function toPaginated<T>(res: { data: T[]; meta?: ResponseMeta | null }): Paginated<T> {
  return {
    items: res.data,
    pagination: res.meta?.pagination ?? {
      page: 1,
      pageSize: res.data.length,
      totalItems: res.data.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

export const resourceUrl = (
  resource: Pick<Resource<unknown>, 'apiPath'>,
  ...segments: Array<string | number>
): string => [resource.apiPath, ...segments.map((s) => encodeURIComponent(String(s)))].join('/');

/** Bulk import contract (BFF resourceImportRoute ⇄ ImportDialog). */
export interface ImportRowResult {
  /** 0-based index in the submitted rows. */
  index: number;
  status: 'created' | 'failed';
  id?: string;
  error?: { code: string; message: string; details?: Array<{ field: string; message: string }> };
}

export interface ImportSummary {
  total: number;
  created: number;
  failed: number;
  results: ImportRowResult[];
}
