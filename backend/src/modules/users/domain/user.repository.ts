import type { Page, PageRequest } from '#core/domain/pagination.js';
import type { Repository } from '#core/domain/repository.js';
import type { User } from './user.entity.js';

/**
 * Attribute constraints produced by authorization policies, e.g.
 * { branchCode: 'B01' } or { ownerId: '<user id>' }. Multiple constraints are OR-ed.
 */
export type UserAccessConstraint = Record<string, string | null>;

export interface RoleSummary {
  code: string;
  name: string;
  permissions: string[];
}

/** Minimal identity for messaging (no credentials). */
export interface UserContact {
  id: string;
  username: string;
  email: string;
  fullName: string;
}

export interface UserDirectoryFilter {
  /** Holds ANY of these roles. */
  roles?: string[];
  /** Holds EVERY permission unscoped (directly, via resource:* or *). */
  allPermissions?: string[];
  excludeIds?: string[];
  /** Only these users (e.g. to check that a chosen user qualifies). */
  ids?: string[];
}

export interface UserRepository extends Repository<User> {
  findByUsername(username: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByExternalIdentity(provider: string, subject: string): Promise<User | null>;
  findPageConstrained(
    request: PageRequest,
    constraints: UserAccessConstraint[] | null,
  ): Promise<Page<User>>;
  findRoles(codes: string[]): Promise<RoleSummary[]>;
  /** Active (not deleted, not disabled) users matching the filter. */
  findActiveUserIds(filter: UserDirectoryFilter, limit?: number): Promise<string[]>;
  findContacts(ids: readonly string[]): Promise<UserContact[]>;
  /** Users with a local password last changed within [from, to). */
  findPasswordsChangedBetween(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<Array<{ id: string; passwordChangedAt: Date }>>;
}

/** Previous password hashes for reuse prevention. */
export interface PasswordHistoryRepository {
  /** Most recent hashes first. */
  recent(userId: string, count: number): Promise<string[]>;
  add(userId: string, passwordHash: string): Promise<void>;
  /** Keeps only the newest `keep` entries. */
  prune(userId: string, keep: number): Promise<void>;
}

export const PASSWORD_HISTORY = Symbol('PasswordHistoryRepository');

export const USER_REPOSITORY = Symbol('UserRepository');
