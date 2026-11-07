import { meetsRequirement, type AccessRequirement } from '@/features/auth/permissions';
import type { DashboardId, DashboardRange } from './types';

/**
 * The dashboard catalogue: one entry per dashboard, in menu order. Isomorphic
 * (no React, no server-only code), so the page, the BFF route, the navigation
 * and the client shell all read the same definitions.
 *
 * Adding a dashboard:
 *   1. its payload type in DashboardDataMap (types.ts)
 *   2. an entry here
 *   3. a provider in api/providers.ts      (compile error until it exists)
 *   4. a view in components/views/index.ts (compile error until it exists)
 *   5. messages under dashboards.catalogue.<id> and dashboards.<id> (en + am)
 *   6. the feature flag and a navigation item in app.config.ts
 */
export type DashboardCategory = 'sales' | 'insights' | 'operations' | 'people';

export interface DashboardDefinition {
  id: DashboardId;
  /** Lucide icon name; must be in the navigation icon map (shared/layouts/navigation.tsx). */
  icon: string;
  category: DashboardCategory;
  /** Feature flag (app.config.ts → features) that switches the dashboard on for a product. */
  flag: string;
  /** Who may open it; omit for any signed-in user. The provider's backend calls are still authorised. */
  requires?: AccessRequirement;
  /** Periods offered in the range switcher, shortest first. */
  ranges: readonly DashboardRange[];
  defaultRange: DashboardRange;
  /** Background refresh interval while the page is open (0 = manual only). */
  refreshSeconds: number;
}

const ALL_RANGES = ['7d', '30d', '90d', '12m'] as const;

export const dashboardFlag = (id: DashboardId): string => `dashboards.${id}`;

const define = (
  id: DashboardId,
  options: Omit<DashboardDefinition, 'id' | 'flag' | 'ranges' | 'defaultRange' | 'refreshSeconds'> &
    Partial<Pick<DashboardDefinition, 'ranges' | 'defaultRange' | 'refreshSeconds'>>,
): DashboardDefinition => ({
  id,
  flag: dashboardFlag(id),
  ranges: ALL_RANGES,
  defaultRange: '30d',
  refreshSeconds: 300,
  ...options,
});

export const DASHBOARDS: readonly DashboardDefinition[] = [
  define('crm', { icon: 'Handshake', category: 'sales' }),
  define('ecommerce', { icon: 'ShoppingCart', category: 'sales' }),
  define('analytics', { icon: 'ChartLine', category: 'insights', refreshSeconds: 60 }),
  define('finance', { icon: 'Landmark', category: 'insights', defaultRange: '12m' }),
  define('logistics', { icon: 'Truck', category: 'operations', refreshSeconds: 60 }),
  define('support', { icon: 'Headset', category: 'operations', refreshSeconds: 60 }),
  define('academy', { icon: 'GraduationCap', category: 'people' }),
  define('hr', { icon: 'IdCard', category: 'people', defaultRange: '12m' }),
];

export const DASHBOARD_CATEGORIES: readonly DashboardCategory[] = [
  'sales',
  'insights',
  'operations',
  'people',
];

export function findDashboard(id: string): DashboardDefinition | undefined {
  return DASHBOARDS.find((d) => d.id === id);
}

export interface DashboardAccessContext {
  isFeatureEnabled: (flag: string) => boolean;
  user: { permissions: readonly string[]; roles: readonly string[] } | null | undefined;
}

/** Whether this user may open this dashboard in this product. */
export function canOpenDashboard(
  definition: DashboardDefinition,
  ctx: DashboardAccessContext,
): boolean {
  if (!ctx.isFeatureEnabled(definition.flag)) return false;
  return definition.requires ? meetsRequirement(ctx.user, definition.requires) : !!ctx.user;
}

/** The dashboards a user may open, in catalogue order. */
export function availableDashboards(ctx: DashboardAccessContext): DashboardDefinition[] {
  return DASHBOARDS.filter((d) => canOpenDashboard(d, ctx));
}
