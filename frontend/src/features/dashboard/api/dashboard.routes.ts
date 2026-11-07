import type { AuditLogEntry } from '@/features/audit/types';
import { apiRoute } from '@/features/auth/api/api-route';
import { hasPermission } from '@/features/auth/permissions';
import type { BoundBackendClient } from '@/infrastructure/api/backend-client';
import type { AppCoreSessionData } from '@/features/auth/api/session-data';
import type { DashboardSummary } from '../types';
import { loadWorkspace } from './workspace';

async function userStats(api: BoundBackendClient): Promise<DashboardSummary['userStats']> {
  const count = async (status?: string) => {
    const res = await api.get<unknown[]>('/users', {
      query: { pageSize: 1, ...(status ? { 'filter[status]': status } : {}) },
    });
    return res.meta?.pagination?.totalItems ?? 0;
  };
  const [total, active, locked, disabled] = await Promise.all([
    count(),
    count('ACTIVE'),
    count('LOCKED'),
    count('DISABLED'),
  ]);
  return { total, active, locked, disabled };
}

/**
 * Aggregates several NestJS calls into one dashboard payload (used by the route
 * and server prefetch). Staff who work on NIB Digital Solutions get their
 * workspace; everyone else gets the general overview (users, audit trail).
 */
export async function loadDashboard(
  api: BoundBackendClient,
  session: AppCoreSessionData,
): Promise<DashboardSummary> {
  const { user } = session;
  const sessionEndsAt = new Date(session.refreshTokenExpiresAt).toISOString();
  const workspace = await loadWorkspace(api, user.permissions);
  if (workspace) return { workspace, userStats: null, recentActivity: null, sessionEndsAt };

  const [stats, activity] = await Promise.all([
    hasPermission(user.permissions, 'users:read') ? userStats(api) : Promise.resolve(null),
    hasPermission(user.permissions, 'audit:read')
      ? api
          .get<AuditLogEntry[]>('/audit-logs', { query: { pageSize: 8, sort: 'occurredAt:desc' } })
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);
  return { workspace: null, userStats: stats, recentActivity: activity, sessionEndsAt };
}

/** GET /api/dashboard — a typical BFF responsibility: one screen-shaped response. */
export const getDashboard = apiRoute<DashboardSummary>({}, async ({ api, session }) => ({
  data: await loadDashboard(api, session),
}));
