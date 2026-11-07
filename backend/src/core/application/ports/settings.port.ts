/**
 * Runtime settings: values an administrator changes while the product runs
 * (company details, money and date formats, mail and document texts) — as
 * opposed to environment variables, which need a deployment.
 *
 * Any module can add its own settings at startup and read them anywhere:
 *
 *   onModuleInit() {
 *     this.settings.define([
 *       { key: 'loans.maxTenorMonths', group: 'loans', type: 'number',
 *         label: 'Longest tenor (months)', default: 60, min: 1, max: 360 },
 *     ]);
 *   }
 *   const tenor = await this.settings.number('loans.maxTenorMonths');
 *
 * Only values that differ from the default are stored. Never put secrets here:
 * settings are readable in the administration screen and the audit trail.
 */
export type SettingValue = string | number | boolean | null;

export type SettingType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'email'
  | 'url'
  | 'color'
  /** A PNG or JPEG as a data URL (logos). */
  | 'image';

export interface SettingDefinition {
  /** "<group>.<name>", e.g. "company.name". Stable: code reads it. */
  key: string;
  /** Tab the setting appears under in the administration screen. */
  group: string;
  type: SettingType;
  /** English label and help text (the UI translates `settings.keys.<key>` when present). */
  label: string;
  description?: string;
  default: SettingValue;
  /** Allowed values of a `select`. */
  options?: readonly string[];
  /** Number range, or text length. */
  min?: number;
  max?: number;
  /** Empty is not accepted. */
  required?: boolean;
  /** Readable by every signed-in user (branding, formats), not only administrators. */
  public?: boolean;
}

export interface Settings {
  /** Adds definitions (call from onModuleInit). Duplicate keys throw. */
  define(definitions: readonly SettingDefinition[]): void;
  definitions(): SettingDefinition[];
  /** Every setting with its effective value (stored, else default). */
  all(): Promise<Record<string, SettingValue>>;
  get(key: string): Promise<SettingValue>;
  string(key: string): Promise<string>;
  number(key: string): Promise<number>;
  boolean(key: string): Promise<boolean>;
}

export const SETTINGS = Symbol('Settings');

/** Money and date formats of the product, read from the "format.*" settings. */
export interface FormatSettings {
  currencyCode: string;
  currencyPosition: 'before' | 'after';
  decimalSeparator: string;
  thousandSeparator: string;
  decimals: number;
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  timeZone: string;
}

export const DEFAULT_FORMATS: FormatSettings = {
  currencyCode: 'ETB',
  currencyPosition: 'before',
  decimalSeparator: '.',
  thousandSeparator: ',',
  decimals: 2,
  dateFormat: 'DD/MM/YYYY',
  timeZone: 'Africa/Addis_Ababa',
};

export function formatsFrom(values: Record<string, SettingValue>): FormatSettings {
  const text = (key: string, fallback: string): string => {
    const v = values[key];
    return typeof v === 'string' ? v : fallback;
  };
  const decimals = values['format.decimals'];
  return {
    currencyCode: text('format.currencyCode', DEFAULT_FORMATS.currencyCode),
    currencyPosition: text('format.currencyPosition', 'before') === 'after' ? 'after' : 'before',
    decimalSeparator: text('format.decimalSeparator', DEFAULT_FORMATS.decimalSeparator),
    thousandSeparator: SEPARATORS[text('format.thousandSeparator', 'comma')] ?? ',',
    decimals: typeof decimals === 'number' ? decimals : DEFAULT_FORMATS.decimals,
    dateFormat: text(
      'format.dateFormat',
      DEFAULT_FORMATS.dateFormat,
    ) as FormatSettings['dateFormat'],
    timeZone: text('format.timeZone', DEFAULT_FORMATS.timeZone),
  };
}

/** Thousand separators are stored by name: a bare " " or "" is easy to lose in a form. */
const SEPARATORS: Record<string, string> = { comma: ',', dot: '.', space: ' ', none: '' };
