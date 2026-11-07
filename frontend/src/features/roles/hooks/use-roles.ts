'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { createResourceHooks } from '@/shared/data/resource-hooks';
import { permissionsResource, rolesResource } from '../resource';
import type { PermissionDefinition, Role, RoleInput } from '../types';

/** Roles data hooks: component → hook → /api/roles (Next.js) → NestJS. */
const roles = createResourceHooks<Role, RoleInput, RoleInput>(rolesResource);

export const roleKeys = roles.keys;
export const useRoles = roles.useList;
export const useSaveRole = roles.useSave;
export const useDeleteRole = roles.useRemove;
export const useImportRoles = roles.useImport;
export const rolesExportPath = roles.exportPath;

export function usePermissionCatalogue() {
  return useQuery({
    queryKey: permissionsResource.keys.all,
    queryFn: async ({ signal }) =>
      (await apiFetch<PermissionDefinition[]>(permissionsResource.apiPath, { signal })).data,
    staleTime: 5 * 60_000,
  });
}
