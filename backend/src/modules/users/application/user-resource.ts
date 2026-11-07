import type { ResourceContext } from '#core/application/security/principal.js';
import type { User } from '../domain/user.entity.js';

/** Describes a user as an authorization resource (for ABAC policies). */
export function userResource(user: User): ResourceContext {
  return {
    type: 'User',
    id: user.id,
    ownerId: user.id,
    attributes: { branchCode: user.branchCode },
  };
}

export const UserPermissions = {
  read: 'users:read',
  create: 'users:create',
  update: 'users:update',
  delete: 'users:delete',
  restore: 'users:restore',
} as const;
