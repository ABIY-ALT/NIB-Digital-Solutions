'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import type { UserProfile } from '@/shared/types';
import type { PersonalActivityPage, PersonalActivitySummary } from '../types';

export const profileKeys = {
  me: ['profile', 'me'] as const,
  activity: (pageSize: number) => ['profile', 'activity', pageSize] as const,
  activityAll: ['profile', 'activity'] as const,
  summary: ['profile', 'activity-summary'] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.me,
    queryFn: async ({ signal }) => (await apiFetch<UserProfile>('/api/profile', { signal })).data,
  });
}

/** Self-service update of display name and phone (optimistic concurrency via `version`). */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      version: number;
      fullName?: string;
      phoneNumber?: string | null;
    }) => (await apiFetch<UserProfile>('/api/profile', { method: 'PATCH', body: input })).data,
    onSuccess: (profile) => {
      qc.setQueryData(profileKeys.me, profile);
      void qc.invalidateQueries({ queryKey: profileKeys.activityAll });
      void qc.invalidateQueries({ queryKey: profileKeys.summary });
    },
  });
}

/** My activity timeline, newest first, loaded page by page (cursor = chain position). */
export function useMyActivity(pageSize = 20) {
  return useInfiniteQuery({
    queryKey: profileKeys.activity(pageSize),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      (
        await apiFetch<PersonalActivityPage>('/api/account/activity', {
          query: { limit: pageSize, cursor: pageParam ?? undefined },
          signal,
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useMyActivitySummary() {
  return useQuery({
    queryKey: profileKeys.summary,
    queryFn: async ({ signal }) =>
      (await apiFetch<PersonalActivitySummary>('/api/account/activity/summary', { signal })).data,
    staleTime: 60_000,
  });
}
