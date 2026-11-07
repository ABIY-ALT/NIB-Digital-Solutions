'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { parseListParams, withListDefaults, type ListDefaults } from '@/shared/lib/list-params';
import type { ListParams } from '@/shared/types';
import { useUiSettings } from '@/shared/ui/ui-settings';

/**
 * Table state (page, size, sort, search, filters) kept in the URL, so lists are
 * shareable, bookmarkable and survive refresh. Feeds feature list hooks.
 * Pass a module-level `defaults` object (e.g. `usersResource.listDefaults`); anything it
 * leaves out falls back to the product defaults (app.config `ui.pagination`).
 */
export function useListParams(defaults: ListDefaults = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  // Same parser as server prefetching and the BFF, so query keys line up (hydration hits).
  const { pagination } = useUiSettings();
  const params: ListParams = useMemo(
    () => parseListParams(search, withListDefaults(pagination, defaults)),
    [search, pagination, defaults],
  );

  const update = useCallback(
    (patch: Partial<ListParams>, resetPage = true) => {
      // Read the LIVE location: rapid successive updates (e.g. two filters) must compose,
      // not overwrite each other with a query string captured at render time.
      const next = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : search.toString(),
      );
      const set = (key: string, value: string | undefined) =>
        value ? next.set(key, value) : next.delete(key);
      if (patch.page !== undefined) set('page', patch.page > 1 ? String(patch.page) : undefined);
      else if (resetPage) next.delete('page');
      if (patch.pageSize !== undefined) set('pageSize', String(patch.pageSize));
      if (patch.search !== undefined) set('search', patch.search.trim() || undefined);
      if (patch.sort !== undefined)
        set('sort', patch.sort.map((s) => `${s.field}:${s.direction}`).join(',') || undefined);
      if (patch.filters) {
        for (const [k, v] of Object.entries(patch.filters)) set(`filter[${k}]`, v || undefined);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, search],
  );

  return { params, update };
}
