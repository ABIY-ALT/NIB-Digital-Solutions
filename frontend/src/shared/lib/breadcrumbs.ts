import type { ReactNode } from 'react';

/** A link a crumb can switch to (e.g. the other tabs of the current page). */
export interface BreadcrumbSibling {
  label: string;
  href: string;
  icon?: ReactNode;
  active?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  /** Omit for non-navigable crumbs (sections, the current page). */
  href?: string;
  icon?: ReactNode;
  /** Renders a switcher menu on the crumb. */
  siblings?: BreadcrumbSibling[];
}

export type CollapsedBreadcrumbs<T> =
  { collapsed: false; items: T[] } | { collapsed: true; head: T[]; hidden: T[]; tail: T[] };

/**
 * Collapses long trails to `head … tail` (MUI/Fluent pattern). The first
 * `before` and last `after` crumbs stay visible; the rest move into the "…" menu.
 * Collapsing only happens when it hides at least two crumbs.
 */
export function collapseBreadcrumbs<T>(
  items: T[],
  maxItems: number,
  before = 1,
  after = 2,
): CollapsedBreadcrumbs<T> {
  const keep = Math.max(1, before) + Math.max(1, after);
  if (items.length <= Math.max(maxItems, keep + 1)) return { collapsed: false, items };
  return {
    collapsed: true,
    head: items.slice(0, Math.max(1, before)),
    hidden: items.slice(Math.max(1, before), items.length - Math.max(1, after)),
    tail: items.slice(items.length - Math.max(1, after)),
  };
}

/** Stable identity of a trail, used to avoid store churn when pages re-render. */
export function breadcrumbKey(items: BreadcrumbItem[]): string {
  return JSON.stringify(
    items.map((i) => [
      i.label,
      i.href ?? '',
      i.siblings?.map((s) => [s.href, s.label, !!s.active]) ?? [],
    ]),
  );
}
