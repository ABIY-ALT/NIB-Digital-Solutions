'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { usersResource } from '../resource';
import type { CreateUserValues, UpdateUserValues } from '../schemas';
import type { User } from '../types';

/**
 * Users data hooks (TanStack Query). Components use these — never fetch directly.
 * Standard CRUD comes from the resource factory; admin actions are declared below.
 */
const users = createResourceHooks<User, CreateUserValues, UpdateUserValues>(usersResource);

export const userKeys = users.keys;
export const useUsers = users.useList;
export const useUser = users.useDetail;
export const useCreateUser = users.useCreate;
export const useUpdateUser = users.useUpdate;
export const useDeleteUser = users.useRemove;
export const useImportUsers = users.useImport;
export const usersExportPath = users.exportPath;

export const useRestoreUser = users.action((id: string) => ({ path: [id, 'restore'] }));
export const useUnlockUser = users.action((id: string) => ({ path: [id, 'unlock'] }));
export const useResetUserPassword = users.action(
  ({ id, newPassword }: { id: string; newPassword: string }) => ({
    path: [id, 'reset-password'],
    body: { newPassword },
  }),
  {
    invalidates: false,
  },
);
export const useTerminateUserSessions = users.action<string, { terminated: number }>(
  (id) => ({ path: [id, 'sessions'], method: 'DELETE' }),
  { invalidates: false },
);
