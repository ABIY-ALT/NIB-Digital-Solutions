'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import type { QuickSearchResponse } from '../types';

const MIN_LENGTH = 2;

/** Debounced value (typing pauses before a request is sent). */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Records matching the query across every module the user may read
 * (GET /api/search). Stale requests are aborted; results are cached briefly.
 */
export function useRecordSearch(query: string, enabled: boolean) {
  const q = useDebounced(query.trim(), 220);
  const active = enabled && q.length >= MIN_LENGTH;
  const result = useQuery({
    queryKey: ['quick-search', q],
    queryFn: async ({ signal }) =>
      (await apiFetch<QuickSearchResponse>('/api/search', { query: { q }, signal })).data,
    enabled: active,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    meta: { backgroundErrorToast: false },
  });
  const typing = query.trim() !== q;
  return {
    // Previous results stay visible while the next request runs (no flicker).
    records: enabled && query.trim().length >= MIN_LENGTH ? (result.data?.records ?? []) : [],
    failed: result.data?.failed ?? [],
    searching: active && (typing || result.isFetching),
    minLength: MIN_LENGTH,
  };
}
