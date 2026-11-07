/**
 * Audit record model: who did what, when, to which resource, and with what outcome.
 * Written by the AuditLogger port; persisted append-only.
 */
export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export type AuditCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'DATA_ACCESS'
  | 'DATA_CHANGE'
  | 'FINANCIAL'
  | 'SECURITY'
  | 'SYSTEM';

export interface AuditRecord {
  id?: string;
  occurredAt: Date;
  actorId: string | null;
  actorUsername: string | null;
  action: string;
  category: AuditCategory;
  resourceType: string | null;
  resourceId: string | null;
  outcome: AuditOutcome;
  errorCode: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  /** Non-sensitive contextual data only. Never secrets, tokens or full PII. */
  metadata: Record<string, unknown> | null;
}
