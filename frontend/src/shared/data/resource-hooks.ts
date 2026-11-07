'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { apiFetch, type ApiRequestInit } from '@/infrastructure/api/api-fetch';
import type { ListParams, Paginated } from '@/shared/types';
import { toListQuery } from '@/shared/types';
import { changeReasonHeaders, isApprovalTicket, type ApprovalTicket } from './approval';
import type { AppMutationMeta } from './query-client';
import {
  normaliseParams,
  resourceUrl,
  toPaginated,
  type ImportSummary,
  type Resource,
} from './resource';

/**
 * Standard TanStack Query hooks for a resource (component → hook → BFF → backend).
 *
 *   const roles = createResourceHooks<Role, RoleInput, RoleInput>(rolesResource);
 *   export const useRoles = roles.useList;
 *   export const useSaveRole = roles.useSave;
 *   export const useUnlockUser = users.action((id: string) => ({ path: [id, 'unlock'], method: 'POST' }));
 *
 * Conventions: list queries keep the previous page while the next loads;
 * mutations invalidate the resource (awaited, so buttons stay busy until fresh
 * data arrives); creates carry an idempotency key; every call is cancellable.
 *
 * Maker–checker: writes resolve to the saved record OR an ApprovalTicket (HTTP
 * 202) when the change needs a checker — use `useSaveFeedback()` to tell the
 * user which one happened. An optional `reason` is sent to the checker.
 */
export interface Identified {
  id: string;
}

export interface HookOptions {
  enabled?: boolean;
  staleTime?: number;
}

export interface ListHookOptions extends HookOptions {
  /** Poll interval (live screens such as the audit log). */
  refetchInterval?: number | false;
  /** Marks requests as background traffic (does not keep the idle session alive). */
  background?: boolean;
}

export interface MutationHookOptions {
  meta?: AppMutationMeta;
}

export interface ActionRequest {
  /** Path segments appended to the resource's BFF path. */
  path?: Array<string | number>;
  method?: NonNullable<ApiRequestInit['method']>;
  body?: unknown;
  query?: NonNullable<ApiRequestInit['query']>;
}

/** useAll's default query: one page of the largest size the backend serves. */
const ALL_ITEMS_QUERY = { pageSize: 100 };

export function createResourceHooks<
  T extends Identified,
  TCreate = Partial<T>,
  TUpdate = Partial<T>,
>(resource: Resource<T>) {
  const { keys } = resource;
  const url = (...segments: Array<string | number>) => resourceUrl(resource, ...segments);

  /** Paginated list driven by URL list params (see useListParams). */
  function useList(params: ListParams, { background, ...options }: ListHookOptions = {}) {
    const normalised = normaliseParams(params);
    return useQuery({
      queryKey: keys.list(normalised),
      queryFn: async ({ signal }): Promise<Paginated<T>> =>
        toPaginated(
          await apiFetch<T[]>(resource.apiPath, {
            query: toListQuery(normalised),
            signal,
            background,
          }),
        ),
      placeholderData: keepPreviousData,
      ...options,
    });
  }

  /** Unpaginated list for pickers (bounded by the backend's max page size). */
  function useAll(
    query: Record<string, string | number> = ALL_ITEMS_QUERY,
    options: HookOptions = {},
  ) {
    return useQuery({
      queryKey: keys.scope('all', query),
      queryFn: async ({ signal }) =>
        (
          await apiFetch<T[]>(resource.apiPath, {
            query: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
            signal,
          })
        ).data,
      staleTime: 60_000,
      ...options,
    });
  }

  function useDetail(id: string | null | undefined, options: HookOptions = {}) {
    return useQuery({
      queryKey: keys.detail(id ?? ''),
      queryFn: async ({ signal }) => (await apiFetch<T>(url(id!), { signal })).data,
      ...options,
      enabled: !!id && (options.enabled ?? true),
    });
  }

  function useCreate(options: MutationHookOptions = {}) {
    const qc = useQueryClient();
    return useMutation({
      // One idempotency key per logical submission: retries of the same call reuse it.
      mutationFn: async (
        input: TCreate & { idempotencyKey?: string; reason?: string | null },
      ): Promise<T | ApprovalTicket> => {
        const {
          idempotencyKey = crypto.randomUUID(),
          reason,
          ...body
        } = input as TCreate & { idempotencyKey?: string; reason?: string | null };
        return (
          await apiFetch<T | ApprovalTicket>(resource.apiPath, {
            method: 'POST',
            body,
            headers: { 'idempotency-key': idempotencyKey, ...changeReasonHeaders(reason) },
          })
        ).data;
      },
      onSuccess: (created) => {
        if (!isApprovalTicket(created)) qc.setQueryData(keys.detail(created.id), created);
        return qc.invalidateQueries({ queryKey: keys.lists() });
      },
      meta: options.meta,
    });
  }

  function useUpdate(options: MutationHookOptions = {}) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async ({
        id,
        input,
        reason,
      }: {
        id: string;
        input: TUpdate;
        reason?: string | null;
      }): Promise<T | ApprovalTicket> =>
        (
          await apiFetch<T | ApprovalTicket>(url(id), {
            method: 'PATCH',
            body: input,
            headers: changeReasonHeaders(reason),
          })
        ).data,
      onSuccess: (updated) => {
        if (!isApprovalTicket(updated)) qc.setQueryData(keys.detail(updated.id), updated);
        return qc.invalidateQueries({ queryKey: keys.all });
      },
      meta: options.meta,
    });
  }

  /** Create or update in one hook (dialogs that serve both). */
  function useSave(options: MutationHookOptions = {}) {
    const create = useCreate(options);
    const update = useUpdate(options);
    return {
      mutateAsync: ({
        id,
        input,
        reason,
      }: {
        id?: string;
        input: TCreate | TUpdate;
        reason?: string | null;
      }): Promise<T | ApprovalTicket> =>
        id
          ? update.mutateAsync({ id, input: input as TUpdate, reason })
          : create.mutateAsync({
              ...(input as TCreate & { idempotencyKey?: string }),
              reason,
            }),
      isPending: create.isPending || update.isPending,
      error: create.error ?? update.error,
      reset: () => {
        create.reset();
        update.reset();
      },
    };
  }

  /** DELETE; pass `version` for optimistic-concurrency checks and `reason` for the checker. */
  function useRemove(options: MutationHookOptions = {}) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (
        target: string | { id: string; version?: number; reason?: string | null },
      ): Promise<T | ApprovalTicket> => {
        const { id, version, reason } =
          typeof target === 'string' ? { id: target, version: undefined, reason: null } : target;
        return (
          await apiFetch<T | ApprovalTicket>(url(id), {
            method: 'DELETE',
            query: version !== undefined ? { version } : undefined,
            headers: changeReasonHeaders(reason),
          })
        ).data;
      },
      onSuccess: (result, target) => {
        if (!isApprovalTicket(result)) {
          qc.removeQueries({
            queryKey: keys.detail(typeof target === 'string' ? target : target.id),
          });
        }
        return qc.invalidateQueries({ queryKey: keys.all });
      },
      meta: options.meta,
    });
  }

  /** Bulk import (POST {apiPath}/import) — pairs with resourceImportRoute and <ImportDialog>. */
  function useImport(options: MutationHookOptions = {}) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async ({
        rows,
        batchId,
      }: {
        rows: Array<Record<string, string>>;
        batchId: string;
      }) =>
        (
          await apiFetch<ImportSummary>(url('import'), {
            method: 'POST',
            body: { rows, batchId },
            timeoutMs: 120_000,
          })
        ).data,
      onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
      meta: options.meta,
    });
  }

  /**
   * Custom endpoint on the resource (unlock, restore, reset-password…). Returns a
   * hook; by default the whole resource is invalidated afterwards.
   */
  function action<TVars, TResult = T>(
    build: (vars: TVars) => ActionRequest,
    config: { invalidates?: QueryKey[] | false } = {},
  ) {
    return function useResourceAction(options: MutationHookOptions = {}) {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: async (vars: TVars) => {
          const req = build(vars);
          return (
            await apiFetch<TResult>(url(...(req.path ?? [])), {
              method: req.method ?? 'POST',
              body: req.body,
              query: req.query,
            })
          ).data;
        },
        onSuccess: () =>
          config.invalidates === false
            ? undefined
            : Promise.all(
                (config.invalidates ?? [keys.all]).map((queryKey) =>
                  qc.invalidateQueries({ queryKey }),
                ),
              ),
        meta: options.meta,
      });
    };
  }

  return {
    keys,
    exportPath: url('export'),
    useList,
    useAll,
    useDetail,
    useCreate,
    useUpdate,
    useSave,
    useRemove,
    useImport,
    action,
  };
}
