import type { ListParams, SortState } from '@/shared/types';

/** Defaults a list screen declares once (resource definition) and every layer reuses. */
export interface ListDefaults {
  pageSize?: number;
  sort?: SortState[];
  /** Upper bound enforced when parsing untrusted input (BFF). */
  maxPageSize?: number;
}

/**
 * Product defaults (app.config `ui.pagination`) under a list's own defaults.
 * Browser (useListParams) and server (pages, API routes) both build their
 * defaults with this, so they parse the same URL to the same query key.
 */
export function withListDefaults(
  product: Pick<ListDefaults, 'pageSize' | 'maxPageSize'>,
  defaults: ListDefaults = {},
): ListDefaults {
  return { pageSize: product.pageSize, maxPageSize: product.maxPageSize, ...defaults };
}

type SearchParamsLike = Pick<URLSearchParams, 'get' | 'forEach'>;

/** Next.js `searchParams` (server components) → URLSearchParams. */
export function toSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
    else if (value !== undefined) out.set(key, value);
  }
  return out;
}

function parseSort(raw: string | null): SortState[] | undefined {
  if (!raw) return undefined;
  const sort = raw
    .split(',')
    .map((s) => {
      const [field = '', direction] = s.split(':');
      return { field: field.trim(), direction: direction === 'desc' ? 'desc' : 'asc' } as SortState;
    })
    .filter((s) => /^[A-Za-z][\w.]{0,63}$/.test(s.field));
  return sort.length ? sort : undefined;
}

/**
 * URL query → ListParams. The ONE parser used by the browser (useListParams),
 * server prefetching (pages) and the BFF, so query keys match across all three:
 * `?page=2&pageSize=50&search=abebe&sort=name:asc&filter[status]=ACTIVE`.
 */
export function parseListParams(
  search: SearchParamsLike,
  defaults: ListDefaults = {},
): Required<Pick<ListParams, 'page' | 'pageSize' | 'search' | 'sort' | 'filters'>> {
  const filters: Record<string, string> = {};
  search.forEach((value, key) => {
    const m = /^filter\[([\w.]{1,64})\]$/.exec(key);
    if (m?.[1] && value) filters[m[1]] = value;
  });
  const max = defaults.maxPageSize ?? 100;
  const pageSize = Math.min(
    max,
    Math.max(1, Number(search.get('pageSize')) || defaults.pageSize || 20),
  );
  return {
    page: Math.max(1, Math.floor(Number(search.get('page')) || 1)),
    pageSize,
    search: (search.get('search') ?? '').slice(0, 200),
    sort: parseSort(search.get('sort')) ?? defaults.sort ?? [],
    filters,
  };
}
