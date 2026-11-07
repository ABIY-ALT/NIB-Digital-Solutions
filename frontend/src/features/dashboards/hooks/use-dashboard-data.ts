'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import {
  dashboardsKeys,
  type DashboardId,
  type DashboardPayload,
  type DashboardRange,
} from '../types';

/**
 * Dashboard payload: component → this hook → GET /api/dashboards/{id} (BFF) →
 * the dashboard's provider. The page prefetches the same key on the server,
 * so the first paint has data; switching the range keeps the previous numbers
 * on screen until the new ones arrive.
 */
export function useDashboardData<K extends DashboardId>(
  id: K,
  range: DashboardRange,
  { refreshSeconds = 0 }: { refreshSeconds?: number } = {},
) {
  return useQuery({
    queryKey: dashboardsKeys.detail(id, range),
    queryFn: async ({ signal }) =>
      (
        await apiFetch<DashboardPayload<K>>(`/api/dashboards/${encodeURIComponent(id)}`, {
          signal,
          query: { range },
          background: true,
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: refreshSeconds > 0 ? refreshSeconds * 1_000 : false,
  });
}
