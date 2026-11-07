'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { dashboardQueryKey, type DashboardSummary } from '../types';

export function useDashboard() {
  return useQuery({
    queryKey: dashboardQueryKey,
    queryFn: async ({ signal }) =>
      (await apiFetch<DashboardSummary>('/api/dashboard', { signal, background: true })).data,
    refetchInterval: 60_000,
  });
}
