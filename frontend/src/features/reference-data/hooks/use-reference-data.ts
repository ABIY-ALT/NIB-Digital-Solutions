'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { changeReasonHeaders, type ApprovalTicket } from '@/shared/data/approval';
import { recordOptionKeys } from '@/shared/data/record-options';
import { createResourceHooks } from '@/shared/data/resource-hooks';
import { normaliseParams, toPaginated } from '@/shared/data/resource';
import { toListQuery, type ListParams } from '@/shared/types';
import { REFERENCE_DATA_API, referenceTypesResource } from '../resource';
import type {
  ItemInput,
  LookupOption,
  ReferenceDataItem,
  ReferenceDataType,
  TypeInput,
} from '../types';

/** Reference data hooks: component → hook → /api/reference-data (Next.js) → NestJS. */
const types = createResourceHooks<ReferenceDataType, TypeInput, TypeInput>(referenceTypesResource);

export const referenceTypeKeys = types.keys;
export const useSaveReferenceType = types.useSave;
export const useDeleteReferenceType = types.useRemove;

export function useReferenceTypes() {
  return types.useAll({ pageSize: 100, sort: 'name:asc' }, { staleTime: 60_000 });
}

export const referenceItemKeys = {
  all: ['reference-data-items'] as const,
  list: (type: string, params: ListParams) =>
    ['reference-data-items', type, normaliseParams(params)] as const,
  lookup: (type: string, locale: string, parent?: string | null, all?: boolean) =>
    ['reference-data-lookup', type, locale, parent ?? '', !!all] as const,
};

export function useReferenceItems(type: string | null, params: ListParams) {
  return useQuery({
    queryKey: referenceItemKeys.list(type ?? '', params),
    queryFn: async ({ signal }) =>
      toPaginated(
        await apiFetch<ReferenceDataItem[]>(
          `${REFERENCE_DATA_API}/types/${encodeURIComponent(type!)}/items`,
          { query: toListQuery(normaliseParams(params)), signal },
        ),
      ),
    enabled: !!type,
    placeholderData: keepPreviousData,
  });
}

/** Refreshes lists, items and every dropdown after a change. */
function useInvalidateReferenceData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: referenceTypeKeys.all }),
      qc.invalidateQueries({ queryKey: referenceItemKeys.all }),
      qc.invalidateQueries({ queryKey: ['reference-data-lookup'] }),
      qc.invalidateQueries({ queryKey: recordOptionKeys.all }),
      qc.invalidateQueries({ queryKey: ['approvals'] }),
    ]);
}

export function useSaveReferenceItem() {
  const invalidate = useInvalidateReferenceData();
  return useMutation({
    mutationFn: async ({
      type,
      id,
      input,
      reason,
    }: {
      type: string;
      id?: string;
      input: ItemInput;
      reason?: string | null;
    }) =>
      (
        await apiFetch<ReferenceDataItem | ApprovalTicket>(
          id
            ? `${REFERENCE_DATA_API}/items/${encodeURIComponent(id)}`
            : `${REFERENCE_DATA_API}/types/${encodeURIComponent(type)}/items`,
          { method: id ? 'PATCH' : 'POST', body: input, headers: changeReasonHeaders(reason) },
        )
      ).data,
    onSuccess: invalidate,
  });
}

export function useDeleteReferenceItem() {
  const invalidate = useInvalidateReferenceData();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string | null }) =>
      (
        await apiFetch<ReferenceDataItem | ApprovalTicket>(
          `${REFERENCE_DATA_API}/items/${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: changeReasonHeaders(reason) },
        )
      ).data,
    onSuccess: invalidate,
  });
}

/**
 * Options of a reference list for dropdowns, in the reader's language
 * (effective items only unless `includeInactive`), optionally filtered by parent.
 *
 *   const branches = useLookup('branches');
 *   const regionBranches = useLookup('branches', { parent: 'AA' });
 */
export function useLookup(
  type: string,
  options: { parent?: string | null; includeInactive?: boolean; enabled?: boolean } = {},
) {
  const locale = useLocale();
  return useQuery({
    queryKey: referenceItemKeys.lookup(type, locale, options.parent, options.includeInactive),
    queryFn: async ({ signal }) =>
      (
        await apiFetch<LookupOption[]>(
          `${REFERENCE_DATA_API}/lookups/${encodeURIComponent(type)}`,
          {
            query: {
              parent: options.parent ?? undefined,
              includeInactive: options.includeInactive ? 'true' : undefined,
            },
            signal,
          },
        )
      ).data,
    staleTime: 5 * 60_000,
    enabled: options.enabled ?? true,
  });
}
