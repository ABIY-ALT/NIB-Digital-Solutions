/**
 * Field-level change evidence attached to DATA_CHANGE audit records: what a
 * write changed, with the previous and the new value of every field.
 *
 * Secrets are never recorded: a redacted field only says THAT it changed.
 */
export type AuditChangeOperation = 'create' | 'update' | 'delete' | 'restore';

export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
  /** Value withheld (secret); only the fact that it changed is recorded. */
  redacted?: true;
}

export interface AuditChange {
  resourceType: string;
  resourceId: string | null;
  operation: AuditChangeOperation;
  /** Submitted for maker–checker approval, not applied yet. */
  proposed?: true;
  fields: AuditFieldChange[];
}

export type AuditSnapshot = Record<string, unknown>;

export const REDACTED = '[REDACTED]';

/** Field names whose values must never reach the audit trail. */
const SECRET_NAME = /(password|passphrase|secret|token|apikey|privatekey)/i;
const SECRET_WORDS = new Set(['hash', 'salt', 'pin', 'otp', 'cvv']);

/** passwordHash, mfaSecret, api_token, pin … but not shipping or pinned. */
export function isSecretField(name: string): boolean {
  if (SECRET_NAME.test(name)) return true;
  return name.split(/(?=[A-Z])|[_\s-]/).some((w) => SECRET_WORDS.has(w.toLowerCase()));
}

/** Bookkeeping columns that change on every write and carry no business meaning. */
const IGNORED_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'version',
  'deletedAt',
  'deletedBy',
]);

/** Long values are cut so one record cannot grow without bound. */
const MAX_VALUE_CHARS = 2_000;

export interface DiffOptions {
  /** Extra fields to redact (in addition to the secret-name pattern). */
  redact?: readonly string[];
  /** Extra fields to leave out entirely. */
  ignore?: readonly string[];
}

/** JSON-safe, size-bounded copy of a value (dates → ISO, bigint/decimal → string). */
export function auditValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  switch (typeof value) {
    case 'bigint':
      return value.toString();
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'string':
      return truncated(value);
    case 'boolean':
      return value;
    case 'object':
      return Array.isArray(value) ? value.map((v) => auditValue(v)) : auditObject(value);
    default:
      // Functions and symbols have no meaningful textual form in an audit record.
      return null;
  }
}

function truncated(text: string): string {
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

function auditObject(value: object): unknown {
  // Decimal-like values (Prisma.Decimal) serialise through toJSON/toString.
  const withJson = value as { toJSON?: () => unknown };
  if (typeof withJson.toJSON === 'function' && !isPlainObject(value)) {
    return auditValue(withJson.toJSON());
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = isSecretField(k) ? REDACTED : auditValue(v);
  }
  const json = JSON.stringify(out);
  return json.length > MAX_VALUE_CHARS * 4 ? `${json.slice(0, MAX_VALUE_CHARS)}…` : out;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Field-level diff of two snapshots. `before = null` describes a creation
 * (every non-empty field is listed), `after = null` a deletion.
 */
export function diffSnapshots(
  before: AuditSnapshot | null,
  after: AuditSnapshot | null,
  options: DiffOptions = {},
): AuditFieldChange[] {
  const redact = new Set(options.redact ?? []);
  const ignore = new Set([...IGNORED_FIELDS, ...(options.ignore ?? [])]);
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const changes: AuditFieldChange[] = [];
  for (const field of keys) {
    if (ignore.has(field)) continue;
    const previous = auditValue(before?.[field]);
    const next = auditValue(after?.[field]);
    if (same(previous, next)) continue;
    // A creation lists only the fields that were actually set (a deletion likewise).
    if (!before && isUnset(next)) continue;
    if (!after && isUnset(previous)) continue;
    const secret = redact.has(field) || isSecretField(field);
    changes.push(
      secret ? redactedChange(field, previous, next) : { field, before: previous, after: next },
    );
  }
  return changes;
}

const isUnset = (value: unknown): boolean => value === null || value === '';

/** A secret field only says THAT it changed (or was set or cleared). */
function redactedChange(field: string, previous: unknown, next: unknown): AuditFieldChange {
  return {
    field,
    before: previous === null ? null : REDACTED,
    after: next === null ? null : REDACTED,
    redacted: true,
  };
}

/** Create / update / delete / restore, from the snapshots and soft-delete markers. */
export function changeOperation(
  before: AuditSnapshot | null,
  after: AuditSnapshot | null,
): AuditChangeOperation {
  if (!before) return 'create';
  if (!after) return 'delete';
  const wasDeleted = before['deletedAt'] != null;
  const isDeleted = after['deletedAt'] != null;
  if (!wasDeleted && isDeleted) return 'delete';
  if (wasDeleted && !isDeleted) return 'restore';
  return 'update';
}
