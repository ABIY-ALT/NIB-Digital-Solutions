import { defineResource } from '@/shared/data/resource';
import type { AuditLogEntry } from './types';

/** Audit log resource (read-only; large pages, newest first). */
export const auditResource = defineResource<AuditLogEntry>({
  name: 'audit-logs',
  apiPath: '/api/audit-logs',
  backendPath: '/audit-logs',
  listDefaults: {
    pageSize: 100,
    maxPageSize: 200,
    sort: [{ field: 'occurredAt', direction: 'desc' }],
  },
});
