'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { fuzzyFilter } from '@/shared/lib/fuzzy';
import type { Paginated } from '@/shared/types';
import { toPaginated } from './resource';

/**
 * Data layer of the record picker (shared/ui/record-picker.tsx).
 *
 * A picker reads options from either
 *   • a server source key — "roles", "users", "refdata.branches" — served by
 *     GET /api/options/{source} (backend: registered OptionSources), or
 *   • a static array (client-side search and paging over the same API).
 *
 * Pages load on demand (infinite scroll); selected values are resolved to
 * labels from the options already in the cache, fetching only unknown ones.
 */
export interface PickerOption {
  value: string;
  label: string;
  description?: string | null;
  /** Short trailing text, e.g. a code. */
  hint?: string | null;
  group?: string | null;
  disabled?: boolean;
}

export type OptionSourceRef = string | readonly PickerOption[];

export const OPTIONS_API = '/api/options';
const RESOLVE_CHUNK = 200;

export const recordOptionKeys = {
  /** Invalidate after changing records any picker may show. */
  all: ['record-options'] as const,
  source: (source: string) => ['record-options', source] as const,
  list: (source: string, locale: string, parent: string, search: string, pageSize: number) =>
    ['record-options', source, locale, 'list', parent, search, pageSize] as const,
  resolve: (source: string, locale: string, values: string) =>
    ['record-options', source, locale, 'resolve', values] as const,
};

async function fetchOptions(
  source: string,
  query: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<Paginated<PickerOption>> {
  return toPaginated(
    await apiFetch<PickerOption[]>(`${OPTIONS_API}/${encodeURIComponent(source)}`, {
      query,
      signal,
    }),
  );
}

export interface OptionPages {
  options: PickerOption[];
  /** Matches on the server (or in the static list). */
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  loadMore: () => void;
  retry: () => void;
}

/** Searchable, incrementally loaded options of a source. */
export function useOptionPages(
  source: OptionSourceRef,
  {
    search = '',
    parent,
    pageSize = 20,
    enabled = true,
  }: { search?: string; parent?: string | null; pageSize?: number; enabled?: boolean },
): OptionPages {
  const locale = useLocale();
  const remote = typeof source === 'string';
  const query = useInfiniteQuery({
    queryKey: recordOptionKeys.list(
      remote ? source : '',
      locale,
      parent ?? '',
      search.trim(),
      pageSize,
    ),
    queryFn: ({ pageParam, signal }) =>
      fetchOptions(
        source as string,
        {
          page: pageParam,
          pageSize,
          search: search.trim() || undefined,
          parent: parent ?? undefined,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNextPage ? last.pagination.page + 1 : undefined,
    enabled: remote && enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // Static lists: fuzzy search, then reveal `pageSize` more per loadMore().
  const [shown, setShown] = useState({ search: '', pages: 1 });
  const pages = shown.search === search ? shown.pages : 1;
  const matches = useMemo(
    () =>
      remote
        ? []
        : fuzzyFilter(source, search, (o) => ({
            label: o.label,
            keywords: [o.value, o.hint, o.description],
          })).map((r) => r.item),
    [remote, source, search],
  );

  if (!remote) {
    return {
      options: matches.slice(0, pages * pageSize),
      total: matches.length,
      hasMore: matches.length > pages * pageSize,
      isLoading: false,
      isFetching: false,
      isFetchingMore: false,
      isError: false,
      loadMore: () => setShown({ search, pages: pages + 1 }),
      retry: () => undefined,
    };
  }

  const loaded = query.data?.pages ?? [];
  return {
    options: loaded.flatMap((p) => p.items),
    total: loaded[0]?.pagination.totalItems ?? 0,
    hasMore: !!query.hasNextPage,
    isLoading: query.isPending && enabled,
    isFetching: query.isFetching,
    isFetchingMore: query.isFetchingNextPage,
    isError: query.isError,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    retry: () => void query.refetch(),
  };
}

/** The options a cached query holds: every loaded page of a list, or resolved values. */
function cachedEntries(kind: unknown, data: unknown): PickerOption[] {
  if (kind === 'list') {
    return ((data as InfiniteData<Paginated<PickerOption>>).pages ?? []).flatMap((p) => p.items);
  }
  return kind === 'resolve' ? (data as PickerOption[]) : [];
}

/** Options already cached for a source (any search / parent), by value. */
function cachedOptions(qc: QueryClient, source: string, locale: string): Map<string, PickerOption> {
  const known = new Map<string, PickerOption>();
  for (const [key, data] of qc.getQueriesData<unknown>({
    queryKey: recordOptionKeys.source(source),
  })) {
    if (!data || key[2] !== locale) continue;
    for (const o of cachedEntries(key[3], data)) known.set(o.value, o);
  }
  return known;
}

/**
 * Resolves selected values to options (labels), in the order given. Unknown
 * values (e.g. a record that no longer exists) are left out of the map.
 */
export function useResolvedOptions(
  source: OptionSourceRef,
  values: readonly string[],
): { byValue: Map<string, PickerOption>; isLoading: boolean } {
  const locale = useLocale();
  const qc = useQueryClient();
  const remote = typeof source === 'string';
  const key = useMemo(
    () => [...new Set(values)].sort((a, b) => a.localeCompare(b)).join(','),
    [values],
  );
  const query = useQuery({
    queryKey: recordOptionKeys.resolve(remote ? source : '', locale, key),
    queryFn: async ({ signal }) => {
      const wanted = key.split(',');
      const known = cachedOptions(qc, source as string, locale);
      const missing = wanted.filter((v) => !known.has(v));
      for (let i = 0; i < missing.length; i += RESOLVE_CHUNK) {
        const chunk = missing.slice(i, i + RESOLVE_CHUNK);
        const page = await fetchOptions(source as string, { values: chunk.join(',') }, signal);
        for (const o of page.items) known.set(o.value, o);
      }
      return wanted.flatMap((v) => known.get(v) ?? []);
    },
    enabled: remote && key.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const byValue = useMemo(() => {
    const map = new Map<string, PickerOption>();
    if (!remote) {
      for (const o of source) map.set(o.value, o);
    } else {
      for (const o of query.data ?? []) map.set(o.value, o);
    }
    return map;
  }, [remote, source, query.data]);

  return { byValue, isLoading: remote && key.length > 0 && query.isPending };
}
