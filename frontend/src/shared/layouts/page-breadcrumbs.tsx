'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { breadcrumbKey, type BreadcrumbItem } from '@/shared/lib/breadcrumbs';

/**
 * Page-level breadcrumb overrides. The shell derives the trail from the
 * navigation config; a page can then:
 *   • append  — add crumbs below the nav trail (a tab, a record name, a wizard step);
 *   • replace — supply the whole trail after "Home";
 *   • hide    — suppress breadcrumbs (e.g. a full-screen flow).
 *
 * Usage (client component):  usePageBreadcrumbs([{ label: user.fullName }]);
 * Usage (server page):       <PageBreadcrumbs items={[{ label: 'Security' }]} />
 */
export type PageBreadcrumbMode = 'append' | 'replace' | 'hide';

interface PageBreadcrumbState {
  entry: { owner: symbol; mode: PageBreadcrumbMode; items: BreadcrumbItem[] } | null;
  set: (owner: symbol, mode: PageBreadcrumbMode, items: BreadcrumbItem[]) => void;
  release: (owner: symbol) => void;
}

export const usePageBreadcrumbStore = create<PageBreadcrumbState>((set) => ({
  entry: null,
  set: (owner, mode, items) => set({ entry: { owner, mode, items } }),
  // Only the page that registered the entry may clear it (avoids races on navigation).
  release: (owner) => set((s) => (s.entry?.owner === owner ? { entry: null } : s)),
}));

export function usePageBreadcrumbs(
  items: BreadcrumbItem[],
  mode: PageBreadcrumbMode = 'append',
): void {
  const key = breadcrumbKey(items);
  const { set, release } = usePageBreadcrumbStore.getState();
  useEffect(() => {
    const owner = Symbol('page-breadcrumbs');
    set(owner, mode, items);
    return () => release(owner);
    // `key` captures the items' identity; re-running on every new array would loop renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode, set, release]);
}

/** Declarative form, usable from server components (renders nothing). */
export function PageBreadcrumbs({
  items = [],
  mode = 'append',
}: {
  items?: BreadcrumbItem[];
  mode?: PageBreadcrumbMode;
}) {
  usePageBreadcrumbs(items, mode);
  return null;
}
