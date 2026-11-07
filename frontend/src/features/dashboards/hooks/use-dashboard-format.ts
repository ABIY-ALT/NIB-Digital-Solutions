'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { useFormats } from '@/features/settings/hooks/use-settings';
import { formatMoneyWith } from '@/shared/lib/money';
import { compactNumber } from '@/shared/ui/charts';
import type { Granularity } from '../types';

/**
 * Locale- and settings-aware formatters for dashboard views. Money follows the
 * product's currency (Administration › Settings); everything else follows the
 * reader's language — so views never hard-code a currency or a date pattern.
 */
export function useDashboardFormat() {
  const locale = useLocale();
  const { format } = useFormats();

  return useMemo(() => {
    const currency = format.currencyCode;
    const number = new Intl.NumberFormat(locale);
    const unit = (u: 'second' | 'minute' | 'hour' | 'day', v: number) =>
      new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: u,
        unitDisplay: 'narrow',
        maximumFractionDigits: 1,
      }).format(v);
    let currencyCompact: Intl.NumberFormat | null = null;
    try {
      currencyCompact = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      });
    } catch {
      currencyCompact = null; // not an ISO 4217 code: fall back to "CODE 1.2M"
    }
    const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
      new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(locale, options);

    return {
      locale,
      currency,
      count: (v: number) => number.format(Math.round(v)),
      compact: (v: number) => compactNumber(v, locale),
      /** Ratio → "12.5%". */
      percent: (ratio: number, digits = 1) =>
        new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }).format(ratio),
      decimal: (v: number, digits = 1) =>
        new Intl.NumberFormat(locale, {
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }).format(v),
      /** Whole currency units, product format: "ETB 1,250". */
      money: (v: number) => formatMoneyWith(Math.round(v), { ...format, decimals: 0 }),
      /** Compact for KPIs and axes: "ETB 1.2M". */
      moneyCompact: (v: number) =>
        currencyCompact ? currencyCompact.format(v) : `${currency} ${compactNumber(v, locale)}`,
      /** Seconds → "3m 12s". */
      duration: (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return m ? `${unit('minute', m)} ${unit('second', s)}` : unit('second', s);
      },
      minutes: (v: number) =>
        v >= 60
          ? `${unit('hour', Math.floor(v / 60))} ${unit('minute', Math.round(v % 60))}`
          : unit('minute', Math.round(v)),
      hours: (v: number) => unit('hour', v),
      days: (v: number) => unit('day', v),
      /** Time-series bucket label for the payload's granularity. */
      bucket: (iso: string, granularity: Granularity) =>
        granularity === 'month'
          ? date(iso, { month: 'short' })
          : date(iso, { month: 'short', day: 'numeric' }),
      shortDate: (iso: string) => date(iso, { month: 'short', day: 'numeric' }),
      dayTime: (iso: string) =>
        new Date(iso).toLocaleString(locale, {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      /** Weekday names, Monday first (Intl: works in every language). */
      weekdays: Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
      ),
      country: (code: string) => {
        try {
          return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
        } catch {
          return code;
        }
      },
    };
  }, [locale, format]);
}

export type DashboardFormat = ReturnType<typeof useDashboardFormat>;
