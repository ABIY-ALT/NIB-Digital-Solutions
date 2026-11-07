'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { toPaginated } from '@/shared/data/resource';
import type { Paginated } from '@/shared/types';
import type {
  AppNotification,
  BroadcastInput,
  NotificationAction,
  NotificationListParams,
  NotificationPreference,
  NotificationSummary,
  NotificationTarget,
} from '../types';

/** Notification centre hooks: component → hook → /api/notifications → NestJS. */
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: ['notifications', 'list'] as const,
  list: (p: NotificationListParams) => ['notifications', 'list', p] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  summary: ['notifications', 'summary'] as const,
  preferences: ['notifications', 'preferences'] as const,
};

const BASE = '/api/notifications';

export function useNotifications(params: NotificationListParams) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated(
        await apiFetch<AppNotification[]>(BASE, {
          query: {
            folder: params.folder,
            category: params.category || undefined,
            search: params.search || undefined,
            page: params.page,
            pageSize: params.pageSize,
          },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useNotification(id: string | null) {
  return useQuery({
    queryKey: notificationKeys.detail(id ?? ''),
    queryFn: async ({ signal }) =>
      (await apiFetch<AppNotification>(`${BASE}/${encodeURIComponent(id!)}`, { signal })).data,
    enabled: !!id,
  });
}

/** Counters + latest messages for the bell. Polls in the background (not user activity). */
export function useNotificationSummary() {
  return useQuery({
    queryKey: notificationKeys.summary,
    queryFn: async ({ signal }) =>
      (await apiFetch<NotificationSummary>(`${BASE}/summary`, { signal, background: true })).data,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    meta: { backgroundErrorToast: false },
  });
}

const FLAG: Partial<Record<NotificationAction, Partial<AppNotification>>> = {
  read: { read: true },
  unread: { read: false },
  star: { starred: true },
  unstar: { starred: false },
};
/** Actions that move messages out of the current folder view. */
const MOVES = new Set<NotificationAction>(['archive', 'unarchive', 'trash', 'restore', 'delete']);

/**
 * Bulk/single actions with optimistic updates: flags change instantly in every
 * cached list, moved messages disappear from the current view; the server
 * state is re-fetched afterwards (and rolled back on error).
 */
export function useNotificationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      target,
    }: {
      action: NotificationAction;
      target: NotificationTarget;
    }) =>
      (
        await apiFetch<{ affected: number }>(`${BASE}/actions`, {
          method: 'POST',
          body: { action, ...target },
        })
      ).data,
    onMutate: async ({ action, target }) => {
      if (!('ids' in target)) return { snapshot: [] as Array<[QueryKey, unknown]> };
      await qc.cancelQueries({ queryKey: notificationKeys.lists });
      const ids = new Set(target.ids);
      const snapshot = qc.getQueriesData<Paginated<AppNotification>>({
        queryKey: notificationKeys.lists,
      });
      qc.setQueriesData<Paginated<AppNotification>>({ queryKey: notificationKeys.lists }, (old) => {
        if (!old) return old;
        if (MOVES.has(action)) {
          const items = old.items.filter((n) => !ids.has(n.id));
          return {
            items,
            pagination: {
              ...old.pagination,
              totalItems: Math.max(
                0,
                old.pagination.totalItems - (old.items.length - items.length),
              ),
            },
          };
        }
        const patch = FLAG[action] ?? {};
        return { ...old, items: old.items.map((n) => (ids.has(n.id) ? { ...n, ...patch } : n)) };
      });
      for (const id of ids) {
        qc.setQueryData<AppNotification>(notificationKeys.detail(id), (old) =>
          old ? { ...old, ...FLAG[action] } : old,
        );
      }
      return { snapshot: snapshot as Array<[QueryKey, unknown]> };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useNotificationPreferences(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: async ({ signal }) =>
      (await apiFetch<NotificationPreference[]>(`${BASE}/preferences`, { signal })).data,
    enabled,
  });
}

export function useSaveNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      preferences: Array<Pick<NotificationPreference, 'category' | 'inApp' | 'email'>>,
    ) =>
      (
        await apiFetch<NotificationPreference[]>(`${BASE}/preferences`, {
          method: 'PUT',
          body: { preferences },
        })
      ).data,
    onSuccess: (saved) => qc.setQueryData(notificationKeys.preferences, saved),
  });
}

export function useBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BroadcastInput) =>
      (
        await apiFetch<{ recipients: number }>(`${BASE}/broadcast`, {
          method: 'POST',
          body: input,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
