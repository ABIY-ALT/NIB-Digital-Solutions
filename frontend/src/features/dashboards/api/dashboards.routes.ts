import type { ServerQuery } from '@/features/auth/api/prefetch';
import { apiRoute } from '@/features/auth/api/api-route';
import type { AppCoreSessionData } from '@/features/auth/api/session-data';
import type { BoundBackendClient } from '@/infrastructure/api/backend-client';
import { isFeatureEnabled } from '@/infrastructure/config/app-config.schema';
import { appConfig } from '@/infrastructure/config/app.config';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { parseRange } from '../lib/range';
import {
  availableDashboards,
  canOpenDashboard,
  findDashboard,
  type DashboardDefinition,
} from '../registry';
import {
  dashboardsKeys,
  type DashboardId,
  type DashboardPayload,
  type DashboardRange,
} from '../types';
import { dashboardProviders, type DashboardProvider } from './providers';

/** Runs a dashboard's provider (used by the route and by the page's server prefetch). */
export async function loadDashboardPayload(
  id: DashboardId,
  range: DashboardRange,
  api: BoundBackendClient,
  session: AppCoreSessionData,
): Promise<DashboardPayload> {
  // The mapped provider type is exact per id; widen it once for the lookup.
  const provider = dashboardProviders[id] as DashboardProvider<DashboardPayload['data']>;
  const now = new Date();
  return {
    id,
    range,
    source: provider.source,
    generatedAt: now.toISOString(),
    data: await provider.load({ api, session, range, now }),
  };
}

/** Matches useDashboardData(id, range) on the client. */
export function dashboardQuery(id: DashboardId, range: DashboardRange): ServerQuery {
  return {
    queryKey: dashboardsKeys.detail(id, range),
    queryFn: (api, session) => loadDashboardPayload(id, range, api, session),
  };
}

/** The definition when this user may open it in this product, else undefined. */
export function openableDashboard(
  id: string,
  user: AppCoreSessionData['user'],
): DashboardDefinition | undefined {
  const definition = findDashboard(id);
  const ctx = { isFeatureEnabled: (f: string) => isFeatureEnabled(appConfig, f), user };
  return definition && canOpenDashboard(definition, ctx) ? definition : undefined;
}

/** Ids of the dashboards this user may open in this product, in catalogue order. */
export function availableDashboardIds(user: AppCoreSessionData['user']): DashboardId[] {
  return availableDashboards({
    isFeatureEnabled: (f) => isFeatureEnabled(appConfig, f),
    user,
  }).map((d) => d.id);
}

/**
 * GET /api/dashboards/{dashboard}?range=30d — one screen-shaped payload per
 * dashboard. Unknown, switched-off and forbidden dashboards are all 404, so
 * the catalogue of a product cannot be probed.
 */
export const getDashboardData = apiRoute<DashboardPayload, { dashboard: string }>(
  {},
  async ({ req, params, api, session, correlationId }) => {
    const definition = openableDashboard(params.dashboard, session.user);
    if (!definition) {
      throw new ApiClientError({
        code: 'NOT_FOUND',
        message: 'This dashboard does not exist.',
        status: 404,
        correlationId,
      });
    }
    const range = parseRange(new URL(req.url).searchParams.get('range'), definition);
    return { data: await loadDashboardPayload(definition.id, range, api, session) };
  },
);
