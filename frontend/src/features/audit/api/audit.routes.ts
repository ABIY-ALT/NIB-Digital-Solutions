import { apiRoute } from '@/features/auth/api/api-route';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { auditResource } from '../resource';
import type { AuditActivity, AuditFacets, AuditLogEntry } from '../types';

/** GET /api/audit-logs — standard list query (bounded to 200 rows) passed through to the backend. */
export const { list: listAuditLogs } = resourceRoutes<AuditLogEntry>(auditResource, {
  access: { read: 'audit:read' },
});

function cell(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** GET /api/audit-logs/export — the audit trail for the current filters (CSV / XLSX). */
export const exportAuditLogs = resourceExportRoute<AuditLogEntry>(auditResource, {
  access: 'audit:read',
  fileName: 'audit-log',
  batchSize: 200,
  maxRows: 20_000,
  columns: [
    { id: 'occurredAt', header: 'audit.columns.time', value: (e) => e.occurredAt },
    { id: 'action', header: 'audit.columns.action', value: (e) => e.action },
    {
      id: 'category',
      header: 'audit.columns.category',
      value: (e, t) => t(`audit.categories.${e.category}`),
    },
    { id: 'actor', header: 'audit.columns.actor', value: (e) => e.actorUsername },
    {
      id: 'resource',
      header: 'audit.columns.resource',
      value: (e) => [e.resourceType, e.resourceId].filter(Boolean).join(' · '),
    },
    {
      id: 'outcome',
      header: 'audit.columns.outcome',
      value: (e, t) => t(`audit.outcomes.${e.outcome}`),
    },
    { id: 'errorCode', header: 'audit.columns.errorCode', value: (e) => e.errorCode },
    { id: 'ip', header: 'audit.columns.ip', value: (e) => e.ipAddress },
    { id: 'correlationId', header: 'audit.columns.correlation', value: (e) => e.correlationId },
    {
      id: 'changes',
      header: 'audit.detail.sections.changes',
      // "field: before → after" per changed field; secrets stay redacted.
      value: (e) =>
        e.changes
          .flatMap((c) =>
            c.fields.map(
              (f) => `${c.resourceType}.${f.field}: ${cell(f.before)} → ${cell(f.after)}`,
            ),
          )
          .join('; '),
    },
  ],
});

const AUDIT_READ = { requires: { permission: 'audit:read' } } as const;
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;

/** GET /api/audit-logs/:id — one record with its field changes and chain link. */
export const getAuditLog = apiRoute<AuditLogEntry, { id: string }>(
  AUDIT_READ,
  async ({ api, params }) => ({
    data: (await api.get<AuditLogEntry>(`/audit-logs/${encodeURIComponent(params.id)}`)).data,
  }),
);

/** GET /api/audit-logs/activity?from=&to= — totals, failures, actors, top actions. */
export const auditActivity = apiRoute<AuditActivity>(AUDIT_READ, async ({ req, api }) => {
  const url = new URL(req.url);
  const query: Record<string, string> = {};
  for (const key of ['from', 'to']) {
    const value = url.searchParams.get(key);
    if (value && ISO.test(value)) query[key] = value;
  }
  return { data: (await api.get<AuditActivity>('/audit-logs/activity', { query })).data };
});

/** GET /api/audit-logs/facets — recorded actions and resource types (filter pickers). */
export const auditFacets = apiRoute<AuditFacets>(AUDIT_READ, async ({ api }) => ({
  data: (await api.get<AuditFacets>('/audit-logs/facets')).data,
}));
