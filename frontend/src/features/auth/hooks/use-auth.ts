'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import type { PasswordPolicy, SignInOutcome } from '../types';

/**
 * Auth hooks: components call these; they call the Next.js API routes
 * (/api/auth/*), which call the NestJS API. No tokens ever come back.
 */
export function useLogin() {
  return useMutation({
    mutationFn: async (input: { username: string; password: string; callbackUrl?: string }) =>
      (await apiFetch<SignInOutcome>('/api/auth/login', { method: 'POST', body: input })).data,
  });
}

export function useVerifyMfa() {
  return useMutation({
    mutationFn: async (input: { code: string; callbackUrl?: string }) =>
      (await apiFetch<SignInOutcome>('/api/auth/mfa', { method: 'POST', body: input })).data,
  });
}

/** Sign-in step: set the new password required by policy (expired / temporary). */
export function useCompletePasswordChange() {
  return useMutation({
    mutationFn: async (input: { newPassword: string; callbackUrl?: string }) =>
      (await apiFetch<SignInOutcome>('/api/auth/password', { method: 'POST', body: input })).data,
  });
}

/** Asks for a password reset link (the answer never says whether the account exists). */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (input: { identifier: string }) =>
      (await apiFetch<null>('/api/auth/password/forgot', { method: 'POST', body: input })).data,
  });
}

/** Sets a new password with the token from the e-mailed reset link. */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: { token: string; newPassword: string }) =>
      (await apiFetch<null>('/api/auth/password/reset', { method: 'POST', body: input })).data,
  });
}

/** Password rules from the backend policy (public; cached for the session). */
export function usePasswordPolicy() {
  return useQuery({
    queryKey: ['auth', 'password-policy'],
    queryFn: async ({ signal }) =>
      (await apiFetch<PasswordPolicy>('/api/auth/password-policy', { signal })).data,
    staleTime: 30 * 60_000,
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: async (reason?: 'idle' | 'expired') =>
      (
        await apiFetch<{ redirectTo: string }>('/api/auth/logout', {
          method: 'POST',
          body: { reason },
        })
      ).data,
    // Full navigation so every client cache is dropped.
    onSettled: (data, _error, reason) => {
      window.location.assign(data?.redirectTo ?? `/login?reason=${reason ?? 'signed_out'}`);
    },
  });
}
