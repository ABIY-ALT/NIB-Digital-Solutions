import type { AuditChange } from '#core/domain/audit-change.js';
import type { Principal } from '../security/principal.js';

/** Per-request ambient data (correlation id, caller, client info). */
export interface RequestContextData {
  correlationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  principal?: Principal;
  serviceClientId?: string;
  startedAt: number;
  /**
   * Field-level changes written during this request, collected by the
   * repositories and attached to the request's DATA_CHANGE audit record.
   */
  changes?: AuditChange[];
}

export interface RequestContextAccessor {
  current(): RequestContextData | undefined;
  /** Correlation id of the current request, or a fallback for background work. */
  correlationId(): string;
  actorId(): string | null;
}

export const REQUEST_CONTEXT = Symbol('RequestContextAccessor');
