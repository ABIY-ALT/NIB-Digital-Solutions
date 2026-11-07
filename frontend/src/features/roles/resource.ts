import { defineResource } from '@/shared/data/resource';
import type { PermissionDefinition, Role } from './types';

/** Roles resource — one definition for query keys, hooks, BFF routes and server prefetch. */
export const rolesResource = defineResource<Role>({
  name: 'roles',
  apiPath: '/api/roles',
  backendPath: '/roles',
  listDefaults: { pageSize: 20, sort: [{ field: 'name', direction: 'asc' }] },
});

/** Read-only permission catalogue (grouped by resource in the picker). */
export const permissionsResource = defineResource<PermissionDefinition>({
  name: 'permissions',
  apiPath: '/api/permissions',
  backendPath: '/permissions',
});
