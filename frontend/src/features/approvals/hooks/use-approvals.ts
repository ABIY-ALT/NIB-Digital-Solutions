'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { toPaginated } from '@/shared/data/resource';
import type {
  ApprovalListParams,
  ApprovalPolicyEntry,
  ApprovalRequest,
  ApprovalSummary,
} from '../types';

/** Maker–checker hooks: component → hook → /api/approvals (Next.js) → NestJS. */
export const approvalKeys = {
  all: ['approvals'] as const,
  list: (params: ApprovalListParams) => ['approvals', 'list', params] as const,
  detail: (id: string) => ['approvals', 'detail', id] as const,
  summary: ['approvals', 'summary'] as const,
  policy: ['approvals', 'policy'] as const,
  pending: (resourceType: string, ids: string[]) =>
    ['approvals', 'pending', resourceType, ids] as const,
};

const BASE = '/api/approvals';

export function useApprovals(params: ApprovalListParams) {
  return useQuery({
    queryKey: approvalKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated(
        await apiFetch<ApprovalRequest[]>(BASE, {
          query: {
            box: params.box,
            status: params.status?.join(','),
            search: params.search || undefined,
            page: params.page,
            pageSize: params.pageSize,
          },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useApproval(id: string | null) {
  return useQuery({
    queryKey: approvalKeys.detail(id ?? ''),
    queryFn: async ({ signal }) =>
      (await apiFetch<ApprovalRequest>(`${BASE}/${encodeURIComponent(id!)}`, { signal })).data,
    enabled: !!id,
  });
}

/** Counters for badges (nav, dashboard). Polls in the background. */
export function useApprovalSummary(enabled = true) {
  return useQuery({
    queryKey: approvalKeys.summary,
    queryFn: async ({ signal }) =>
      (await apiFetch<ApprovalSummary>(`${BASE}/summary`, { signal, background: true })).data,
    refetchInterval: 60_000,
    staleTime: 20_000,
    enabled,
    meta: { backgroundErrorToast: false },
  });
}

export function useApprovalPolicy() {
  return useQuery({
    queryKey: approvalKeys.policy,
    queryFn: async ({ signal }) =>
      (await apiFetch<ApprovalPolicyEntry[]>(`${BASE}/policy`, { signal })).data,
    staleTime: 10 * 60_000,
  });
}

/** Whether an action is currently under four-eyes control (e.g. "roles.update"). */
export function useApprovalRequired(action: string): boolean {
  const { data } = useApprovalPolicy();
  return !!data?.find((p) => p.action === action)?.required;
}

/** Pending approval per record id (for "pending change" badges on list rows). */
export function usePendingApprovals(resourceType: string, ids: string[]) {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  return useQuery({
    queryKey: approvalKeys.pending(resourceType, sorted),
    queryFn: async ({ signal }) =>
      (
        await apiFetch<Record<string, string>>(`${BASE}/pending`, {
          query: { resourceType, ids: sorted.join(',') },
          signal,
          background: true,
        })
      ).data,
    enabled: sorted.length > 0,
    staleTime: 15_000,
    meta: { backgroundErrorToast: false },
  });
}

export type Decision =
  | { kind: 'approve'; id: string; comment?: string | null }
  | { kind: 'reject'; id: string; comment: string }
  | { kind: 'cancel'; id: string };

/**
 * Approve / reject / withdraw. Approval applies the change, so every cached
 * resource is refreshed (the approved record may appear in any list).
 */
export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (decision: Decision) => {
      const path = `${BASE}/${encodeURIComponent(decision.id)}/${decision.kind}`;
      const body = decision.kind === 'cancel' ? undefined : { comment: decision.comment ?? null };
      return (await apiFetch<ApprovalRequest>(path, { method: 'POST', body })).data;
    },
    onSuccess: (updated, decision) => {
      qc.setQueryData(approvalKeys.detail(updated.id), updated);
      return decision.kind === 'approve'
        ? qc.invalidateQueries()
        : qc.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}
