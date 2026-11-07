'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { formatMoneyWith, moneyFormatFrom, type MoneyFormat } from '@/shared/lib/money';
import type { SettingsData, SettingValue } from '../types';

/** Settings hooks: component → hook → /api/settings → NestJS. */
const BASE = '/api/settings';
export const settingsKeys = {
  all: ['settings'] as const,
  admin: ['settings', 'admin'] as const,
  public: ['settings', 'public'] as const,
};

/** Every setting with its definition (administration screen). */
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.admin,
    queryFn: async ({ signal }) => (await apiFetch<SettingsData>(BASE, { signal })).data,
  });
}

export function useUpdateSettings() {
  return useMutation({
    mutationFn: async (values: Record<string, SettingValue>) =>
      (await apiFetch<SettingsData>(BASE, { method: 'PATCH', body: { values } })).data,
    meta: { invalidates: [settingsKeys.all] },
  });
}

/** Branding and formats every signed-in user may read (cached; changes are rare). */
export function usePublicSettings() {
  return useQuery({
    queryKey: settingsKeys.public,
    queryFn: async ({ signal }) =>
      (await apiFetch<{ values: Record<string, SettingValue> }>(`${BASE}/public`, { signal })).data
        .values,
    staleTime: 10 * 60_000,
    meta: { backgroundErrorToast: false },
  });
}

/**
 * The product's money format, with a ready formatter. Until the settings load
 * (or if they cannot be read) the defaults apply, so amounts always render.
 *
 *   const { money } = useFormats();
 *   money(1250) → "ETB 1,250.00"
 */
export function useFormats(): {
  format: MoneyFormat;
  money: (value: number, currencyCode?: string) => string;
} {
  const { data } = usePublicSettings();
  return useMemo(() => {
    const format = moneyFormatFrom(data);
    return {
      format,
      money: (value: number, currencyCode?: string) => formatMoneyWith(value, format, currencyCode),
    };
  }, [data]);
}
