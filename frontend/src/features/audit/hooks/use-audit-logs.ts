'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { createResourceHooks } from '@/shared/data/resource-hooks';
import type { ListParams } from '@/shared/types';
import { auditResource } from '../resource';
import type { AuditActivity, AuditFacets, AuditLogEntry } from '../types';

const audit = createResourceHooks<AuditLogEntry>(auditResource);
export const auditKeys = {
  ...audit.keys,
  record: (id: string) => ['audit-logs', 'record', id] as const,
  activity: (from?: string, to?: string) =>
    ['audit-logs', 'activity', from ?? '', to ?? ''] as const,
  facets: ['audit-logs', 'facets'] as const,
};
export const auditExportPath = audit.exportPath;

const BASE = auditResource.apiPath;

/** Audit trail list. `live` refreshes every 30 s in the background (not counted as user activity). */
export function useAuditLogs(params: ListParams, options: { live?: boolean } = {}) {
  return audit.useList(params, options.live ? { refetchInterval: 30_000, background: true } : {});
}

/** One record (deep links: /audit?id=…). Records never change, so it is cached for good. */
export function useAuditLog(id: string | null) {
  return useQuery({
    queryKey: auditKeys.record(id ?? ''),
    queryFn: async ({ signal }) =>
      (await apiFetch<AuditLogEntry>(`${BASE}/${encodeURIComponent(id!)}`, { signal })).data,
    enabled: !!id,
    staleTime: Infinity,
  });
}

/** Totals, failures, distinct users and top actions for the selected time window. */
export function useAuditActivity(window: { from?: string; to?: string }) {
  return useQuery({
    queryKey: auditKeys.activity(window.from, window.to),
    queryFn: async ({ signal }) =>
      (
        await apiFetch<AuditActivity>(`${BASE}/activity`, {
          query: { from: window.from, to: window.to },
          signal,
          background: true,
        })
      ).data,
    refetchInterval: 60_000,
    staleTime: 20_000,
    meta: { backgroundErrorToast: false },
  });
}

/** Recorded actions and resource types, for the filter pickers. */
export function useAuditFacets() {
  return useQuery({
    queryKey: auditKeys.facets,
    queryFn: async ({ signal }) => (await apiFetch<AuditFacets>(`${BASE}/facets`, { signal })).data,
    staleTime: 5 * 60_000,
  });
}
