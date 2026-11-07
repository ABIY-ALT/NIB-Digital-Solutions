import type { ApiSchemas } from '@/shared/api';

/** Audit record (shared contract): changes, request context and its tamper-evident chain link. */
export type AuditLogEntry = ApiSchemas['AuditLog'];
/** Field-level change (previous → new values) recorded with a DATA_CHANGE event. */
export type AuditChange = ApiSchemas['AuditChange'];
export type AuditActivity = ApiSchemas['AuditActivity'];
export type AuditFacets = ApiSchemas['AuditFacets'];
export type AuditCategory = AuditLogEntry['category'];
export type AuditOutcome = AuditLogEntry['outcome'];
