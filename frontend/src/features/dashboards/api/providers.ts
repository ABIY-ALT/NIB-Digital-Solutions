import 'server-only';
import type { AppCoreSessionData } from '@/features/auth/api/session-data';
import type { BoundBackendClient } from '@/infrastructure/api/backend-client';
import { SAMPLES } from '../data';
import type { DashboardDataMap, DashboardId, DashboardRange } from '../types';

/**
 * Where each dashboard's numbers come from. The BFF calls the provider; the
 * view only ever sees the payload, so switching a dashboard from sample data
 * to real data is a change in this file alone.
 *
 *   crm: live(async ({ api, range }) => {
 *     const [deals, leads] = await Promise.all([
 *       api.get<DealSummary>('/crm/deals/summary', { query: { range } }),
 *       api.get<LeadStats>('/crm/leads/stats', { query: { range } }),
 *     ]);
 *     return toCrmDashboard(deals.data, leads.data);   // map to CrmDashboard
 *   }),
 *
 * Providers run with the user's token, so the backend still authorises every
 * call; return partial data (empty arrays) rather than failing the whole screen
 * when an optional source is unavailable.
 */
export interface DashboardProviderContext {
  api: BoundBackendClient;
  session: AppCoreSessionData;
  range: DashboardRange;
  now: Date;
}

export interface DashboardProvider<T> {
  /** "sample" makes the UI label the dashboard as sample data. */
  source: 'sample' | 'live';
  load: (ctx: DashboardProviderContext) => Promise<T>;
}

/** Deterministic generated data (the default for every catalogue dashboard). */
export function sample<K extends DashboardId>(id: K): DashboardProvider<DashboardDataMap[K]> {
  return { source: 'sample', load: async ({ range, now }) => SAMPLES[id](range, now) };
}

/** Real data from the backend. */
export function live<T>(load: DashboardProvider<T>['load']): DashboardProvider<T> {
  return { source: 'live', load };
}

export const dashboardProviders: { [K in DashboardId]: DashboardProvider<DashboardDataMap[K]> } = {
  crm: sample('crm'),
  analytics: sample('analytics'),
  ecommerce: sample('ecommerce'),
  academy: sample('academy'),
  logistics: sample('logistics'),
  finance: sample('finance'),
  support: sample('support'),
  hr: sample('hr'),
};
