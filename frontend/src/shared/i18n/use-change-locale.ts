'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/infrastructure/api/api-fetch';

/**
 * Switches the UI language (POST /api/locale sets the cookie), then
 * re-renders server components in the new language.
 *
 *   const changeLocale = useChangeLocale();
 *   changeLocale.mutate('am');
 */
export function useChangeLocale() {
  const router = useRouter();
  return useMutation({
    mutationFn: (locale: string) => apiFetch('/api/locale', { method: 'POST', body: { locale } }),
    onSuccess: () => router.refresh(),
  });
}
