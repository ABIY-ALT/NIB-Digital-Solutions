import { DEFAULT_FORMATS, type FormatSettings } from './ports/settings.port.js';

/**
 * Money, number and date formatting driven by the product's "format.*"
 * settings, for text the server produces itself (PDF documents, e-mails).
 * The frontend has the same functions in shared/lib/money.ts.
 */
export function formatNumber(
  value: number,
  formats: Pick<FormatSettings, 'decimalSeparator' | 'thousandSeparator'> = DEFAULT_FORMATS,
  decimals = 0,
): string {
  if (!Number.isFinite(value)) return '';
  const [whole = '0', fraction] = Math.abs(value).toFixed(decimals).split('.');
  const grouped = groupThousands(whole, formats.thousandSeparator);
  const sign = value < 0 && Number(Math.abs(value).toFixed(decimals)) !== 0 ? '-' : '';
  const decimalPart = fraction ? `${formats.decimalSeparator}${fraction}` : '';
  return `${sign}${grouped}${decimalPart}`;
}

/** "1234567" → "1,234,567". Not digits only (toFixed's "1e+21") → unchanged. */
function groupThousands(whole: string, separator: string): string {
  if (!/^\d+$/.test(whole)) return whole;
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= 3) {
    groups.unshift(whole.slice(Math.max(0, end - 3), end));
  }
  return groups.join(separator);
}

/** "ETB 1,250.00" or "1,250.00 ETB", per the product settings. */
export function formatMoney(
  value: number,
  formats: FormatSettings = DEFAULT_FORMATS,
  currencyCode: string = formats.currencyCode,
): string {
  const amount = formatNumber(value, formats, formats.decimals);
  if (!amount) return '';
  if (!currencyCode) return amount;
  return formats.currencyPosition === 'after'
    ? `${amount} ${currencyCode}`
    : `${currencyCode} ${amount}`;
}

/** Calendar date in the product's time zone and date format. */
export function formatDate(
  value: Date | string | null | undefined,
  formats: Pick<FormatSettings, 'dateFormat' | 'timeZone'> = DEFAULT_FORMATS,
  withTime = false,
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: safeTimeZone(formats.timeZone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = formats.dateFormat
    .replace('YYYY', parts.year ?? '')
    .replace('MM', parts.month ?? '')
    .replace('DD', parts.day ?? '');
  return withTime ? `${day} ${parts.hour}:${parts.minute}` : day;
}

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}
