import { datePreset, encodeFilter, type FilterDef } from '@/shared/lib/table-filters';
import type { BadgeTone } from '@/shared/ui/badge';
import type { AuditCategory, AuditChange, AuditLogEntry } from '../types';

/**
 * Presentation rules for audit records (pure, unit-tested): category colours,
 * readable action names, client details, time windows and change mapping.
 */

export const AUDIT_CATEGORIES: readonly AuditCategory[] = [
  'AUTHENTICATION',
  'AUTHORIZATION',
  'DATA_ACCESS',
  'DATA_CHANGE',
  'FINANCIAL',
  'SECURITY',
  'SYSTEM',
];

export const AUDIT_OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED'] as const;

export const OUTCOME_TONE: Record<AuditLogEntry['outcome'], BadgeTone> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  DENIED: 'warning',
};

/** Tailwind classes per category (static strings so the compiler sees them). */
export interface CategoryStyle {
  tone: BadgeTone;
  /** Accent bar / dot. */
  bar: string;
  /** Text in the category colour. */
  text: string;
  /** Tinted icon square. */
  soft: string;
}

export const CATEGORY_STYLE: Record<AuditCategory, CategoryStyle> = {
  AUTHENTICATION: {
    tone: 'info',
    bar: 'bg-info',
    text: 'text-info',
    soft: 'bg-info-soft text-info',
  },
  AUTHORIZATION: {
    tone: 'warning',
    bar: 'bg-warning',
    text: 'text-warning',
    soft: 'bg-warning-soft text-warning',
  },
  DATA_ACCESS: {
    tone: 'neutral',
    bar: 'bg-subtle-foreground',
    text: 'text-muted-foreground',
    soft: 'bg-muted text-muted-foreground',
  },
  DATA_CHANGE: {
    tone: 'primary',
    bar: 'bg-primary',
    text: 'text-primary-text',
    soft: 'bg-primary-soft text-primary-text',
  },
  FINANCIAL: {
    tone: 'success',
    bar: 'bg-success',
    text: 'text-success',
    soft: 'bg-success-soft text-success',
  },
  SECURITY: {
    tone: 'secondary',
    bar: 'bg-secondary',
    text: 'text-secondary',
    soft: 'bg-secondary-soft text-secondary',
  },
  SYSTEM: {
    tone: 'neutral',
    bar: 'bg-border-strong',
    text: 'text-muted-foreground',
    soft: 'bg-muted text-muted-foreground',
  },
};

export const FAILURE_STYLE: CategoryStyle = {
  tone: 'danger',
  bar: 'bg-danger',
  text: 'text-danger',
  soft: 'bg-danger-soft text-danger',
};

export const isFailure = (e: Pick<AuditLogEntry, 'outcome'>) => e.outcome !== 'SUCCESS';

/** Accent for a record: failures and denials override the category colour. */
export const recordStyle = (e: Pick<AuditLogEntry, 'outcome' | 'category'>): CategoryStyle =>
  isFailure(e) ? FAILURE_STYLE : CATEGORY_STYLE[e.category];

/** Actions submitted for maker–checker approval carry this suffix. */
export const REQUESTED_SUFFIX = '_REQUESTED';

/** "ROLE_UPDATE" → "Role update" (fallback when no translation exists). */
export function humanize(code: string): string {
  const words = code
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : code;
}

/** Splits "ROLE_UPDATE_REQUESTED" into the base action and the maker–checker flag. */
export function parseAction(action: string): { base: string; requested: boolean } {
  return action.endsWith(REQUESTED_SUFFIX)
    ? { base: action.slice(0, -REQUESTED_SUFFIX.length), requested: true }
    : { base: action, requested: false };
}

/** RFC 1918 / loopback / link-local / unique-local: no public location exists. */
export function isPrivateIp(ip: string | null | undefined): boolean {
  const v = (ip ?? '')
    .trim()
    .toLowerCase()
    .replace(/^::ffff:/, '');
  if (!v) return false;
  if (v === '::1' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true;
  const parts = v.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p))) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export { parseUserAgent, type ClientInfo } from '@/shared/lib/user-agent';

// ── Time windows (IB segmented control) ────────────────────────────────────

export const TIME_WINDOWS = ['all', 'today', 'last7', 'last30', 'last90'] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

const OCCURRED_AT: FilterDef = { id: 'occurredAt', label: 'occurredAt', type: 'dateRange' };

/** Calendar-day windows keep the URL stable (shareable) and match the date filter chip. */
export function windowFilter(win: TimeWindow, now = new Date()): string | undefined {
  if (win === 'all') return undefined;
  if (win === 'last90') {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return encodeFilter(OCCURRED_AT, { from, to: datePreset('today', now).to });
  }
  // today, last7 and last30 are date presets of the same name.
  return encodeFilter(OCCURRED_AT, datePreset(win, now));
}

/** Which window the current date filter corresponds to ('custom' for any other range). */
export function activeWindow(raw: string | undefined, now = new Date()): TimeWindow | 'custom' {
  if (!raw) return 'all';
  return TIME_WINDOWS.find((w) => w !== 'all' && windowFilter(w, now) === raw) ?? 'custom';
}

/** `between:from,to` → ISO bounds for the activity summary. */
export function windowBounds(raw: string | undefined): { from?: string; to?: string } {
  if (!raw?.startsWith('between:')) return {};
  const [from, to] = raw.slice('between:'.length).split(',');
  return { from: from || undefined, to: to || undefined };
}

// ── Changes ────────────────────────────────────────────────────────────────

export const REDACTED = '[REDACTED]';

/** One change → before/after records for ChangeDiff (redacted values replaced). */
export function changeRecords(
  change: AuditChange,
  redactedLabel: string,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const f of change.fields) {
    const mask = (v: unknown) => (f.redacted && v !== null ? redactedLabel : v);
    before[f.field] = mask(f.before);
    after[f.field] = mask(f.after);
  }
  return {
    before: change.operation === 'create' ? null : before,
    after: change.operation === 'delete' ? null : after,
  };
}

/** Distinct changed field names across all changes of a record (for the Details column). */
export function changedFields(changes: readonly AuditChange[]): string[] {
  return [...new Set(changes.flatMap((c) => c.fields.map((f) => f.field)))];
}

/** Short id for tables: first block of a UUID, or the value itself when short. */
export function shortId(id: string | null | undefined): string {
  if (!id) return '';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
