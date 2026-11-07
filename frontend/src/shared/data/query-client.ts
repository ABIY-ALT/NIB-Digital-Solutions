import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import { isApiClientError } from '@/shared/errors/api-client-error';

/**
 * Centralised server-state configuration (TanStack Query).
 *
 * Declarative, typed `meta` removes per-component boilerplate:
 *
 *   useMutation({ mutationFn, meta: {
 *     notify: { success: t('toast.unlocked'), error: true },   // global toasts
 *     invalidates: [usersResource.keys.all],                   // awaited invalidation
 *   }})
 *
 * Global error policy:
 *   • queries  — a failed first load renders the component's ErrorState; a failed
 *                BACKGROUND refetch (stale data still on screen) raises a toast.
 *   • mutations — toast only when `meta.notify.error` is set; forms keep mapping
 *                errors inline (applyServerError), so nothing is reported twice.
 *   • session-ending errors are never toasted: SessionGuard signs the user out.
 */
export interface AppQueryMeta extends Record<string, unknown> {
  /** Toast when a background refetch fails while cached data is shown (default: true). */
  backgroundErrorToast?: boolean;
}

export interface AppMutationMeta extends Record<string, unknown> {
  notify?: {
    /** Toast text on success (already translated). */
    success?: string;
    /** true = translated description of the error; string = custom text. */
    error?: boolean | string;
  };
  /** Query keys invalidated after success; awaited so `isPending` spans the refetch. */
  invalidates?: QueryKey[];
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppQueryMeta;
    mutationMeta: AppMutationMeta;
  }
}

export interface QueryClientNotifier {
  success: (message: string) => void;
  error: (error: unknown, override?: string) => void;
}

const endsSession = (error: unknown) => isApiClientError(error) && error.endsSession;

/** Never retry client errors (validation, auth, permission, conflict); retry transient ones twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiClientError(error)) {
    if (['ABORTED', 'CSRF_FAILED'].includes(error.code)) return false;
    if (error.status > 0 && error.status < 500 && error.status !== 408 && error.status !== 429)
      return false;
  }
  return failureCount < 2;
}

export function makeQueryClient(notify: QueryClientNotifier): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (
          endsSession(error) ||
          query.state.data === undefined ||
          query.meta?.backgroundErrorToast === false
        )
          return;
        notify.error(error);
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: async (_data, _variables, _result, mutation) => {
        const meta = mutation.meta;
        if (meta?.invalidates?.length)
          await Promise.all(
            meta.invalidates.map((queryKey) => client.invalidateQueries({ queryKey })),
          );
        if (meta?.notify?.success) notify.success(meta.notify.success);
      },
      onError: (error, _variables, _result, mutation) => {
        const wanted = mutation.meta?.notify?.error;
        if (!wanted || endsSession(error)) return;
        notify.error(error, typeof wanted === 'string' ? wanted : undefined);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000, // also keeps server-prefetched (hydrated) data from refetching on mount
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: { retry: false },
    },
  });
  return client;
}

/** Per-request client for server components (prefetch + dehydrate). Never shared between users. */
export function makeServerQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
}
