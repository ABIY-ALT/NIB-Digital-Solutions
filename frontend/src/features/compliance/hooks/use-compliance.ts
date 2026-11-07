'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { toPaginated } from '@/shared/data/resource';
import type {
  AuditCheckpoint,
  ComplianceOverview,
  IntegrityReport,
  RetentionPreview,
  RetentionRun,
} from '../types';

/** Compliance console hooks: component → hook → /api/compliance → NestJS. */
const BASE = '/api/compliance';
export const complianceKeys = {
  all: ['compliance'] as const,
  overview: ['compliance', 'overview'] as const,
  checkpoints: ['compliance', 'checkpoints'] as const,
  preview: ['compliance', 'retention-preview'] as const,
  runs: (page: number) => ['compliance', 'runs', page] as const,
};

export function useComplianceOverview() {
  return useQuery({
    queryKey: complianceKeys.overview,
    queryFn: async ({ signal }) =>
      (await apiFetch<ComplianceOverview>(`${BASE}/overview`, { signal })).data,
    refetchInterval: 60_000,
  });
}

export function useCheckpoints() {
  return useQuery({
    queryKey: complianceKeys.checkpoints,
    queryFn: async ({ signal }) =>
      (await apiFetch<AuditCheckpoint[]>(`${BASE}/audit/checkpoints`, { signal })).data,
  });
}

export function useVerifyAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await apiFetch<IntegrityReport>(`${BASE}/audit/verify`, {
          method: 'POST',
          timeoutMs: 120_000,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: complianceKeys.overview }),
  });
}

export function useCreateAnchor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch(`${BASE}/audit/anchor`, { method: 'POST' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: complianceKeys.all }),
  });
}

export function useRetentionPreview() {
  return useQuery({
    queryKey: complianceKeys.preview,
    queryFn: async ({ signal }) =>
      (await apiFetch<RetentionPreview[]>(`${BASE}/retention/preview`, { signal })).data,
  });
}

export function useRetentionRuns(page: number) {
  return useQuery({
    queryKey: complianceKeys.runs(page),
    queryFn: async ({ signal }) =>
      toPaginated(
        await apiFetch<RetentionRun[]>(`${BASE}/retention/runs`, { query: { page }, signal }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRunRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dryRun: boolean) =>
      (
        await apiFetch<RetentionRun>(`${BASE}/retention/run`, {
          method: 'POST',
          body: { dryRun },
          timeoutMs: 300_000,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: complianceKeys.all }),
  });
}

export function useTriggerJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      (
        await apiFetch<{ result: 'ran' | 'skipped' }>(
          `${BASE}/jobs/${encodeURIComponent(name)}/run`,
          {
            method: 'POST',
            timeoutMs: 300_000,
          },
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: complianceKeys.all }),
  });
}
