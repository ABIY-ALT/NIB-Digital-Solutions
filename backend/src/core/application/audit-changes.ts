import {
  changeOperation,
  diffSnapshots,
  type AuditChange,
  type AuditSnapshot,
  type DiffOptions,
} from '#core/domain/audit-change.js';
import type { RequestContextData } from './ports/request-context.port.js';

/** Upper bound per request (bulk jobs must not build unbounded audit records). */
const MAX_CHANGES_PER_REQUEST = 50;

/**
 * Records a field-level change in the request context. The next DATA_CHANGE
 * (or SECURITY / FINANCIAL) audit record of the request picks it up. Outside a
 * request (jobs, seeds) nothing is recorded. A write that changed nothing
 * visible is not recorded either.
 */
export function trackChange(
  ctx: RequestContextData | undefined,
  change: {
    resourceType: string;
    resourceId: string | null;
    before: AuditSnapshot | null;
    after: AuditSnapshot | null;
    proposed?: boolean;
  },
  options?: DiffOptions,
): void {
  if (!ctx) return;
  const fields = diffSnapshots(change.before, change.after, options);
  const operation = changeOperation(change.before, change.after);
  if (fields.length === 0 && operation === 'update') return;
  const entry: AuditChange = {
    resourceType: change.resourceType,
    resourceId: change.resourceId,
    operation,
    fields,
    ...(change.proposed ? { proposed: true as const } : {}),
  };
  const list = (ctx.changes ??= []);
  if (list.length < MAX_CHANGES_PER_REQUEST) list.push(entry);
}

/** Removes and returns the changes collected so far. */
export function takeChanges(ctx: RequestContextData | undefined): AuditChange[] {
  if (!ctx?.changes?.length) return [];
  return ctx.changes.splice(0);
}
