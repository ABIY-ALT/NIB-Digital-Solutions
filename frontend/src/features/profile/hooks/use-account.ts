'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import type { Preferences } from '../preferences';
import type { AccountSession, TotpSetup } from '../types';

/** Account self-service hooks: component → hook → /api/account/* → NestJS. */
const accountKeys = {
  sessions: ['account', 'sessions'] as const,
  profile: ['profile', 'me'] as const,
};

export function useMySessions() {
  return useQuery({
    queryKey: accountKeys.sessions,
    queryFn: async ({ signal }) =>
      (await apiFetch<AccountSession[]>('/api/account/sessions', { signal })).data,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/account/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await apiFetch<{ terminated: number }>('/api/account/sessions/revoke-others', {
          method: 'POST',
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) =>
      (
        await apiFetch<{ terminatedSessions: number }>('/api/account/password', {
          method: 'POST',
          body: input,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function useBeginTotpSetup() {
  return useMutation({
    mutationFn: async () =>
      (await apiFetch<TotpSetup>('/api/account/mfa/setup', { method: 'POST' })).data,
  });
}

export function useConfirmTotpSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch('/api/account/mfa/confirm', { method: 'POST', body: { code } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.profile }),
  });
}

export function useDisableMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      apiFetch('/api/account/mfa/disable', { method: 'POST', body: { password } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.profile }),
  });
}

export function useSavePreferences() {
  const router = useRouter();
  return useMutation({
    mutationFn: (prefs: Preferences) =>
      apiFetch<Preferences>('/api/preferences', { method: 'POST', body: prefs }),
    // Theme tokens are rendered on the server: refresh to apply them.
    onSuccess: () => router.refresh(),
  });
}
