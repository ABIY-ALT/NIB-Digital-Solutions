/**
 * Declarative table filters ⇄ the backend list syntax (`filter[field]=<op>:<value>`).
 *
 *   const filters: FilterDef[] = [
 *     { id: 'status', label: 'Status', type: 'multiselect', options: [...] },   // in:A,B
 *     { id: 'mfaEnabled', label: 'MFA', type: 'boolean' },                     // true | false
 *     { id: 'branchCode', label: 'Branch', type: 'text' },                     // contains:x
 *     { id: 'createdAt', label: 'Created', type: 'dateRange' },                // between:ISO,ISO
 *   ];
 *
 * The URL keeps the encoded string, so filtered views are shareable and the
 * same string is forwarded to the backend unchanged (no second mapping layer).
 */
export interface FilterOption {
  value: string;
  label: string;
}

interface FilterBase {
  /** Backend filter field (must be in the endpoint's `filterable` list). */
  id: string;
  label: string;
}

export type FilterDef =
  | (FilterBase & { type: 'select'; options: FilterOption[] })
  | (FilterBase & { type: 'multiselect'; options: FilterOption[] })
  | (FilterBase & { type: 'boolean'; trueLabel?: string; falseLabel?: string })
  | (FilterBase & { type: 'text'; operator?: 'contains' | 'eq'; placeholder?: string })
  | (FilterBase & { type: 'dateRange' });

/** Calendar dates as YYYY-MM-DD in the user's time zone. */
export interface DateRange {
  from?: string;
  to?: string;
}

export type FilterValue = string | string[] | boolean | DateRange;

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local calendar day → the instant it starts / ends (so "to" includes the whole day). */
function dayBoundary(day: string, edge: 'start' | 'end'): string {
  const [y, m, d] = day.split('-').map(Number);
  const date =
    edge === 'start'
      ? new Date(y!, m! - 1, d!, 0, 0, 0, 0)
      : new Date(y!, m! - 1, d!, 23, 59, 59, 999);
  return date.toISOString();
}

/** One value → itself, several → "in:A,B"; none clears the filter. */
function encodeMultiselect(value: FilterValue): string | undefined {
  const values = (Array.isArray(value) ? value : []).filter(Boolean);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : `in:${values.join(',')}`;
}

function encodeText(
  value: FilterValue,
  operator: 'contains' | 'eq' = 'contains',
): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return undefined;
  return operator === 'contains' ? `contains:${text}` : text;
}

/** Calendar days → "between:<start of from>,<end of to>" (either side may be open). */
function encodeDateRange(range: DateRange): string | undefined {
  if (!range.from && !range.to) return undefined;
  const from = range.from ? dayBoundary(range.from, 'start') : '';
  const to = range.to ? dayBoundary(range.to, 'end') : '';
  return `between:${from},${to}`;
}

/** Typed value → URL/backend string; undefined clears the filter. */
export function encodeFilter(def: FilterDef, value: FilterValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  switch (def.type) {
    case 'select':
      return typeof value === 'string' && value ? value : undefined;
    case 'multiselect':
      return encodeMultiselect(value);
    case 'boolean':
      return typeof value === 'boolean' ? String(value) : undefined;
    case 'text':
      return encodeText(value, def.operator);
    case 'dateRange':
      return encodeDateRange(value as DateRange);
  }
}

function decodeBoolean(raw: string): boolean | undefined {
  if (raw === 'true') return true;
  return raw === 'false' ? false : undefined;
}

/** An instant → its local calendar day; anything unparseable → undefined. */
function isoToDay(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : localDate(d);
}

function decodeDateRange(raw: string): DateRange | undefined {
  if (!raw.startsWith('between:')) return undefined;
  const [from, to] = raw.slice('between:'.length).split(',');
  const range: DateRange = { from: isoToDay(from), to: isoToDay(to) };
  return range.from || range.to ? range : undefined;
}

/** URL/backend string → typed value (tolerant: unknown shapes decode to undefined). */
export function decodeFilter(def: FilterDef, raw: string | undefined): FilterValue | undefined {
  if (!raw) return undefined;
  switch (def.type) {
    case 'select':
      return raw.startsWith('in:') ? raw.slice(3).split(',')[0] : raw;
    case 'multiselect':
      return raw.startsWith('in:') ? raw.slice(3).split(',').filter(Boolean) : [raw];
    case 'boolean':
      return decodeBoolean(raw);
    case 'text':
      return raw.startsWith('contains:') ? raw.slice('contains:'.length) : raw;
    case 'dateRange':
      return decodeDateRange(raw);
  }
}

/** A value as plain text (select and text filters hold strings; lists are comma-joined). */
function valueText(value: FilterValue): string {
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(',');
  return [value.from, value.to].filter(Boolean).join(' – ');
}

/** Human summary for an active filter chip ("Active, Locked", "1 Sep – 28 Sep"). */
export function describeFilter(
  def: FilterDef,
  value: FilterValue | undefined,
  locale: string,
  labels: { yes: string; no: string },
): string {
  if (value === undefined) return '';
  switch (def.type) {
    case 'select':
      return def.options.find((o) => o.value === value)?.label ?? valueText(value);
    case 'multiselect': {
      const values = value as string[];
      const names = values.map((v) => def.options.find((o) => o.value === v)?.label ?? v);
      return names.length > 2
        ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
        : names.join(', ');
    }
    case 'boolean':
      return value ? (def.trueLabel ?? labels.yes) : (def.falseLabel ?? labels.no);
    case 'text':
      return `“${valueText(value)}”`;
    case 'dateRange': {
      const r = value as DateRange;
      const fmt = (day?: string) =>
        day
          ? new Date(`${day}T00:00:00`).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : '…';
      return `${fmt(r.from)} – ${fmt(r.to)}`;
    }
  }
}

/** Date-range presets relative to today (local time). */
export function datePreset(
  preset: 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth',
  now = new Date(),
): DateRange {
  const day = (offset: number) =>
    localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  switch (preset) {
    case 'today':
      return { from: day(0), to: day(0) };
    case 'last7':
      return { from: day(-6), to: day(0) };
    case 'last30':
      return { from: day(-29), to: day(0) };
    case 'thisMonth':
      return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(0) };
    case 'lastMonth':
      return {
        from: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: localDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
  }
}
