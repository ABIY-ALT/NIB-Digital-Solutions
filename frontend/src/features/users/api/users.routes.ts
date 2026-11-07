import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute, resourceImportRoute } from '@/features/auth/api/resource-transfer';
import { usersResource } from '../resource';
import {
  createUserSchema,
  importUserSchema,
  passwordPolicy,
  updateUserSchema,
  type CreateUserValues,
  type ImportUserValues,
  type UpdateUserValues,
} from '../schemas';
import type { User } from '../types';

/** Route handlers for /api/users — re-exported by the thin files under app/api/users. */

export const {
  list: listUsers,
  get: getUser,
  create: createUser,
  update: updateUser,
  remove: deleteUser,
} = resourceRoutes<User, CreateUserValues, UpdateUserValues>(usersResource, {
  access: {
    read: 'users:read',
    create: 'users:create',
    update: 'users:update',
    delete: 'users:delete',
  },
  schemas: { create: createUserSchema(), update: updateUserSchema() },
  messages: { created: 'User created.', updated: 'User updated.', deleted: 'User deleted.' },
});

const userPath = (id: string, action: string) =>
  `${usersResource.backendPath}/${encodeURIComponent(id)}/${action}`;

export const restoreUser = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'users:restore' } },
  async ({ api, params }) => ({
    data: (await api.post(userPath(params.id, 'restore'))).data,
    message: 'User restored.',
  }),
);

// ── Admin actions ────────────────────────────────────────────────────────────

const resetBody = z.object({ newPassword: passwordPolicy() });

export const unlockUser = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'users:update' } },
  async ({ api, params }) => ({
    data: (await api.post(userPath(params.id, 'unlock'))).data,
    message: 'Account unlocked.',
  }),
);

export const resetUserPassword = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'users:reset-password' } },
  async ({ req, api, params }) => {
    const body = await readJson(req, parseWith(resetBody));
    return {
      data: (await api.post(userPath(params.id, 'reset-password'), body)).data,
      message: 'Password reset.',
    };
  },
);

export const terminateUserSessions = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'users:update' } },
  async ({ api, params }) => ({
    data: (await api.post(userPath(params.id, 'sessions/terminate'))).data,
    message: 'Sessions ended.',
  }),
);

// ── Data transfer ────────────────────────────────────────────────────────────

/** GET /api/users/export — all users matching the table's filters (CSV / XLSX). */
export const exportUsers = resourceExportRoute<User>(usersResource, {
  access: 'users:read',
  fileName: 'users',
  columns: [
    { id: 'fullName', header: 'users.columns.name', value: (u) => u.fullName },
    { id: 'username', header: 'users.fields.username', value: (u) => u.username },
    { id: 'email', header: 'users.columns.email', value: (u) => u.email },
    { id: 'phoneNumber', header: 'users.fields.phone', value: (u) => u.phoneNumber },
    { id: 'branchCode', header: 'users.columns.branch', value: (u) => u.branchCode },
    { id: 'roles', header: 'users.columns.roles', value: (u) => u.roles.join('; ') },
    {
      id: 'status',
      header: 'users.columns.status',
      value: (u, t) => t(`users.status.${u.status}`),
    },
    { id: 'mfaEnabled', header: 'users.columns.mfa', value: (u) => u.mfaEnabled },
    { id: 'lastLoginAt', header: 'users.columns.lastLogin', value: (u) => u.lastLoginAt },
    { id: 'createdAt', header: 'users.columns.created', value: (u) => u.createdAt },
  ],
});

/** A strong random password that satisfies the policy (never shown; reset it to issue credentials). */
function temporaryPassword(): string {
  return `Aa1!${randomBytes(18).toString('base64url')}`;
}

/** POST /api/users/import — creates users from CSV rows (validated, idempotent, per-row results). */
export const importUsers = resourceImportRoute<User, ImportUserValues, CreateUserValues>(
  usersResource,
  {
    access: 'users:create',
    rowSchema: importUserSchema(),
    toBody: (row) => ({ ...row, password: temporaryPassword() }),
    maxRows: 500,
  },
);
