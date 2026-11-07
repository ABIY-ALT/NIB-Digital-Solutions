/**
 * Configuration-driven navigation. Sidebar, top navigation and breadcrumbs are
 * all rendered from this tree. Items the user cannot access are removed
 * entirely (not just disabled).
 */
export interface NavItem {
  id: string;
  /** i18n key (e.g. "nav.users") — resolved by the app. */
  labelKey: string;
  /** i18n key of a one-line description (shown in top-navigation dropdowns). */
  descriptionKey?: string;
  href?: string;
  /** Lucide icon name (resolved by the navigation components). */
  icon?: string;
  /** User needs ANY of these permissions. */
  permissions?: string[];
  /** User needs ANY of these roles. */
  roles?: string[];
  /** Hidden unless the feature flag is on. */
  feature?: string;
  /** Nested items (one level recommended). */
  children?: NavItem[];
  /** Match child routes as active (default true). */
  matchPrefix?: boolean;
  badge?: string;
}

export interface NavSection {
  id: string;
  labelKey?: string;
  /** Lucide icon name shown on the section's breadcrumb and top-navigation trigger. */
  icon?: string;
  /**
   * Top navigation (horizontal layout): "dropdown" groups the items under the
   * section label; "inline" puts them in the bar. Default: dropdown when the
   * section has a label.
   */
  topNav?: 'dropdown' | 'inline';
  items: NavItem[];
}

export interface NavAccessContext {
  can: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  isFeatureEnabled: (flag: string) => boolean;
}

function allowed(item: NavItem, ctx: NavAccessContext): boolean {
  if (item.feature && !ctx.isFeatureEnabled(item.feature)) return false;
  if (item.permissions?.length && !item.permissions.some((p) => ctx.can(p))) return false;
  if (item.roles?.length && !item.roles.some((r) => ctx.hasRole(r))) return false;
  return true;
}

/** Removes inaccessible items and empty groups/sections. */
export function filterNavigation(sections: NavSection[], ctx: NavAccessContext): NavSection[] {
  const filterItems = (items: NavItem[]): NavItem[] =>
    items
      .filter((item) => allowed(item, ctx))
      .map((item) => (item.children ? { ...item, children: filterItems(item.children) } : item))
      .filter((item) => item.href || (item.children && item.children.length > 0));
  return sections
    .map((s) => ({ ...s, items: filterItems(s.items) }))
    .filter((s) => s.items.length > 0);
}

export interface Crumb {
  labelKey: string;
  href?: string;
}

/** Builds breadcrumbs by locating the deepest nav item matching the path. */
export function breadcrumbsFor(sections: NavSection[], pathname: string): Crumb[] {
  let best: Crumb[] = [];
  const walk = (items: NavItem[], trail: Crumb[]): void => {
    for (const item of items) {
      const crumb: Crumb = { labelKey: item.labelKey, href: item.href };
      const next = [...trail, crumb];
      if (
        item.href &&
        (pathname === item.href || pathname.startsWith(`${item.href}/`)) &&
        next.length >= best.length
      ) {
        best = next;
      }
      if (item.children) walk(item.children, next);
    }
  };
  for (const section of sections) walk(section.items, []);
  return best;
}
