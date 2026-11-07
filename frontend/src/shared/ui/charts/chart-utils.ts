'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Chart foundations shared by every AppCore chart (pure SVG, no chart library,
 * like the NIB IB dashboard): theme palette, "nice" axis ticks, number
 * formatting and a width observer so charts render crisply at any size.
 */

/** Theme-aware series colours (CSS variables from globals.css; dark mode included). */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export const colorAt = (index: number, override?: string) =>
  override ?? CHART_COLORS[index % CHART_COLORS.length]!;

export interface ChartSeries {
  key: string;
  label: string;
  /** Any CSS colour; defaults to the palette. */
  color?: string;
}

export type ValueFormatter = (value: number) => string;

/** Rounded axis maximum and evenly spaced ticks (1-2-2.5-5 steps). */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(10));
}

/** 1 234 567 → "1.2M" (locale-aware, for axes and compact KPIs). */
export function compactNumber(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Observes an element's width (charts measure themselves; 0 until mounted → SSR-safe). */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry?.contentRect.width ?? 0)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
