/**
 * Money and number formatting driven by the product's runtime settings
 * ("format.*" in Administration › Settings), so every screen, document and
 * e-mail writes amounts the same way. The backend has the same functions in
 * core/application/formatting.ts.
 *
 *   const { money } = useFormats();           // features/settings
 *   money(1250)            → "ETB 1,250.00"
 */
export interface MoneyFormat {
  currencyCode: string;
  currencyPosition: 'before' | 'after';
  decimalSeparator: string;
  thousandSeparator: string;
  decimals: number;
}

export const DEFAULT_MONEY_FORMAT: MoneyFormat = {
  currencyCode: 'ETB',
  currencyPosition: 'before',
  decimalSeparator: '.',
  thousandSeparator: ',',
  decimals: 2,
};

/** Thousand separators are stored by name (a bare " " or "" is easy to lose in a form). */
const SEPARATORS: Record<string, string> = { comma: ',', dot: '.', space: ' ', none: '' };

type SettingValue = string | number | boolean | null | undefined;

/** Reads the money format out of the public settings (missing keys fall back to defaults). */
export function moneyFormatFrom(values: Record<string, SettingValue> | undefined): MoneyFormat {
  const text = (key: string, fallback: string): string => {
    const v = values?.[key];
    return typeof v === 'string' ? v : fallback;
  };
  const decimals = values?.['format.decimals'];
  return {
    currencyCode: text('format.currencyCode', DEFAULT_MONEY_FORMAT.currencyCode),
    currencyPosition: text('format.currencyPosition', 'before') === 'after' ? 'after' : 'before',
    decimalSeparator: text('format.decimalSeparator', DEFAULT_MONEY_FORMAT.decimalSeparator),
    thousandSeparator: SEPARATORS[text('format.thousandSeparator', 'comma')] ?? ',',
    decimals: typeof decimals === 'number' ? decimals : DEFAULT_MONEY_FORMAT.decimals,
  };
}

export function formatAmount(
  value: number,
  format: Pick<MoneyFormat, 'decimalSeparator' | 'thousandSeparator'> = DEFAULT_MONEY_FORMAT,
  decimals = 0,
): string {
  if (!Number.isFinite(value)) return '';
  const [whole = '0', fraction] = Math.abs(value).toFixed(decimals).split('.');
  const grouped = groupThousands(whole, format.thousandSeparator);
  const negative = value < 0 && Number(Math.abs(value).toFixed(decimals)) !== 0;
  const sign = negative ? '-' : '';
  const decimalPart = fraction ? `${format.decimalSeparator}${fraction}` : '';
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
export function formatMoneyWith(
  value: number,
  format: MoneyFormat = DEFAULT_MONEY_FORMAT,
  currencyCode: string = format.currencyCode,
): string {
  const amount = formatAmount(value, format, format.decimals);
  if (!amount) return '';
  if (!currencyCode) return amount;
  return format.currencyPosition === 'after'
    ? `${amount} ${currencyCode}`
    : `${currencyCode} ${amount}`;
}

/** Rounds to the currency's decimals without binary drift (1.005 → 1.01). */
export function roundMoney(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
