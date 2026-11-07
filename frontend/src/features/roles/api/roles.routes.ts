import { z } from 'zod';
import { apiRoute } from '@/features/auth/api/api-route';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute, resourceImportRoute } from '@/features/auth/api/resource-transfer';
import { importRoleSchema, type ImportRoleValues } from '../schemas';
import { permissionsResource, rolesResource } from '../resource';
import type { PermissionDefinition, Role } from '../types';

/**
 * Roles & permissions API routes (Next.js BFF) → NestJS /roles, /permissions.
 * Re-exported by the thin files under app/api/roles and app/api/permissions.
 */

const createBody = z.object({
  code: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  permissions: z.array(z.string()).max(200),
});

const updateBody = z.object({
  version: z.number().int().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullish(),
  permissions: z.array(z.string()).max(200).optional(),
});

export const listPermissions = apiRoute(
  { requires: { permission: 'roles:read' } },
  async ({ api }) => ({
    data: (await api.get<PermissionDefinition[]>(permissionsResource.backendPath)).data,
  }),
);

export const {
  list: listRoles,
  get: getRole,
  create: createRole,
  update: updateRole,
  remove: deleteRole,
} = resourceRoutes<Role>(rolesResource, {
  access: {
    read: 'roles:read',
    create: 'roles:create',
    update: 'roles:update',
    delete: 'roles:delete',
  },
  schemas: { create: createBody, update: updateBody },
  messages: { created: 'Role created.', updated: 'Role updated.', deleted: 'Role deleted.' },
});

// ── Data transfer ────────────────────────────────────────────────────────────

export const exportRoles = resourceExportRoute<Role>(rolesResource, {
  access: 'roles:read',
  fileName: 'roles',
  columns: [
    { id: 'name', header: 'roles.fields.name', value: (r) => r.name },
    { id: 'code', header: 'roles.fields.code', value: (r) => r.code },
    { id: 'description', header: 'roles.columns.description', value: (r) => r.description },
    {
      id: 'permissions',
      header: 'roles.columns.permissions',
      value: (r) => r.permissions.join('; '),
    },
    { id: 'users', header: 'roles.columns.users', value: (r) => r.userCount },
    {
      id: 'type',
      header: 'roles.columns.type',
      value: (r, t) => t(r.isSystem ? 'roles.system' : 'roles.custom'),
    },
    { id: 'createdAt', header: 'roles.columns.created', value: (r) => r.createdAt },
  ],
});

/** POST /api/roles/import — the backend still refuses permissions the caller does not hold. */
export const importRoles = resourceImportRoute<Role, ImportRoleValues>(rolesResource, {
  access: 'roles:create',
  rowSchema: importRoleSchema,
  maxRows: 200,
});
