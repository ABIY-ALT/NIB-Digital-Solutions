import type { AuditRecord } from '#core/domain/audit-record.js';

export type AuditEntry = Omit<
  AuditRecord,
  'id' | 'occurredAt' | 'ipAddress' | 'userAgent' | 'correlationId'
> &
  Partial<Pick<AuditRecord, 'ipAddress' | 'userAgent' | 'correlationId'>>;

/** Writes audit records. Implementations must never throw into business flows. */
export interface AuditLogger {
  record(entry: AuditEntry): Promise<void>;
}

export const AUDIT_LOGGER = Symbol('AuditLogger');
