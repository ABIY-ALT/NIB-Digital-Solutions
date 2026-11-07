import type { ApiSchemas } from '@/shared/api';

/** Security & compliance console types (shared contract). */
export type ComplianceOverview = ApiSchemas['ComplianceOverview'];
export type IntegrityReport = ApiSchemas['AuditIntegrityReport'];
export type AuditCheckpoint = ApiSchemas['AuditCheckpoint'];
export type RetentionRun = ApiSchemas['RetentionRun'];
export type RetentionPolicy = ComplianceOverview['retention']['policies'][number];

export interface RetentionPreview {
  policy: string;
  cutoff: string;
  matched: number;
}
