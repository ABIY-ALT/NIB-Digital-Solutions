import 'server-only';
import { dehydrate, HydrationBoundary, type QueryKey } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { BoundBackendClient } from '@/infrastructure/api/backend-client';
import { backend } from '@/infrastructure/api/backend';
import { appConfig } from '@/infrastructure/config/app.config';
import { logger } from '@/infrastructure/logging/logger';
import { makeServerQueryClient } from '@/shared/data/query-client';
import { normaliseParams, toPaginated, type Resource } from '@/shared/data/resource';
import { parseListParams, toSearchParams, withListDefaults } from '@/shared/lib/list-params';
import { toListQuery, type ListParams } from '@/shared/types';
import { getSession } from './session';
import type { AppCoreSessionData } from './session-data';

/**
 * Server-side prefetching (streaming SSR + hydration).
 *
 *   // app/(app)/roles/page.tsx (server component)
 *   const params = pageListParams(await searchParams, rolesResource);
 *   return <Prefetch queries={[listQuery(rolesResource, params)]}><RolesPage /></Prefetch>;
 *
 * The server calls the backend directly (signed service identity + the user's
 * token — nothing reaches the browser but data), fills a per-request QueryClient
 * and streams it to the client. The client hooks use the SAME query keys, so the
 * first paint already contains the table; loading.tsx covers the wait.
 * Failures are swallowed: the client simply fetches (and shows its error state).
 */
export interface ServerQuery {
  queryKey: QueryKey;
  queryFn: (api: BoundBackendClient, session: AppCoreSessionData) => Promise<unknown>;
}

/**
 * A page's `searchParams` → the list params its client table will ask for
 * (same parser and defaults as useListParams, so the prefetched page is a cache hit).
 */
export function pageListParams<T>(
  searchParams: Record<string, string | string[] | undefined>,
  resource: Resource<T>,
): ListParams {
  return parseListParams(
    toSearchParams(searchParams),
    withListDefaults(appConfig.ui.pagination, resource.listDefaults),
  );
}

/** Matches createResourceHooks().useList(params). */
export function listQuery<T>(resource: Resource<T>, params: ListParams): ServerQuery {
  const normalised = normaliseParams(params);
  return {
    queryKey: resource.keys.list(normalised),
    queryFn: async (api) =>
      toPaginated(await api.get<T[]>(resource.backendPath, { query: toListQuery(normalised) })),
  };
}

/** Matches createResourceHooks().useDetail(id). */
export function detailQuery<T>(resource: Resource<T>, id: string): ServerQuery {
  return {
    queryKey: resource.keys.detail(id),
    queryFn: async (api) =>
      (await api.get<T>(`${resource.backendPath}/${encodeURIComponent(id)}`)).data,
  };
}

export async function Prefetch({
  queries,
  children,
}: Readonly<{
  queries: ServerQuery[];
  children: ReactNode;
}>) {
  const session = await getSession();
  if (!session || queries.length === 0) return <>{children}</>;

  const api = backend().as(session.accessToken);
  const queryClient = makeServerQueryClient();
  // prefetchQuery never rejects; failed queries are simply not dehydrated.
  await Promise.all(
    queries.map((q) =>
      queryClient.prefetchQuery({
        queryKey: q.queryKey,
        queryFn: async () => {
          try {
            return await q.queryFn(api, session);
          } catch (err) {
            logger.warn(
              { queryKey: q.queryKey, err: err instanceof Error ? err.message : String(err) },
              'Server prefetch failed; the client will fetch',
            );
            throw err;
          }
        },
      }),
    ),
  );
  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
