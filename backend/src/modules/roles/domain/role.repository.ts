import type { Repository } from '#core/domain/repository.js';
import type { Role } from './role.entity.js';

export interface PermissionDefinition {
  code: string;
  description: string | null;
}

export interface RoleRepository extends Repository<Role> {
  findByCode(code: string): Promise<Role | null>;
  /** The permission catalogue (all assignable permission codes). */
  listPermissions(): Promise<PermissionDefinition[]>;
}

export const ROLE_REPOSITORY = Symbol('RoleRepository');
