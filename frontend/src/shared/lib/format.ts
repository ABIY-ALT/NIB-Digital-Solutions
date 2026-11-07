/** Locale-aware formatting helpers (Intl-based, no dependencies). */

/** A date as the API sends it (ISO string) or as a Date; empty values print as "—". */
type DateInput = string | Date | null | undefined;

const MEDIUM_DATE: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };

export function formatDate(
  value: DateInput,
  locale = 'en',
  options: Intl.DateTimeFormatOptions = MEDIUM_DATE,
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(date);
}

export function formatDateTime(value: DateInput, locale = 'en'): string {
  return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRelative(value: DateInput, locale = 'en', now = Date.now()): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds)
      return rtf.format(Math.round(diffSeconds / seconds), unit);
  }
  return rtf.format(diffSeconds, 'second');
}

export function formatNumber(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}

/** "SUPER_ADMIN" / "reference-data" → "Super admin" / "Reference data" (codes shown to people). */
export const humanizeCode = (code: string): string =>
  code
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function intlLocale(locale: string): string {
  if (locale === 'am') return 'am-ET';
  return locale === 'en' ? 'en-US' : locale;
}
