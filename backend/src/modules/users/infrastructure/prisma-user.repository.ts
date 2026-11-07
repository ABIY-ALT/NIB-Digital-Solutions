import type { AuditSnapshot } from '#core/domain/audit-change.js';
import { Injectable } from '@nestjs/common';
import { compareCodeUnits } from '#core/domain/strings.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import type { User } from '../domain/user.entity.js';
import type {
  PasswordHistoryRepository,
  RoleSummary,
  UserAccessConstraint,
  UserContact,
  UserDirectoryFilter,
  UserRepository,
} from '../domain/user.repository.js';
import {
  userInclude,
  UserPersistenceMapper,
  type UserRecord,
  type UserWrite,
} from './user.persistence-mapper.js';

/** Authorization constraint attribute → column. */
const CONSTRAINT_COLUMNS: Record<string, string> = { ownerId: 'id', branchCode: 'branchCode' };

@Injectable()
export class PrismaUserRepository
  extends PrismaBaseRepository<User, UserRecord, UserWrite>
  implements UserRepository
{
  protected readonly resourceName = 'User';
  protected readonly mapper = new UserPersistenceMapper();
  protected override readonly include = userInclude;
  protected readonly querySpec: QuerySpec = {
    sortable: {
      username: 'username',
      fullName: 'fullName',
      email: 'email',
      status: 'status',
      createdAt: 'createdAt',
      lastLoginAt: 'lastLoginAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      status: { column: 'status', type: 'enum' },
      branchCode: { column: 'branchCode', type: 'string' },
      mfaEnabled: { column: 'mfaEnabled', type: 'boolean' },
      createdAt: { column: 'createdAt', type: 'date' },
    },
    searchable: ['username', 'fullName', 'email'],
    defaultSort: [{ field: 'createdAt', direction: 'desc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.user;
  }

  findByUsername(username: string): Promise<User | null> {
    return this.findOneWhere({ username: username.trim().toLowerCase() });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOneWhere({ email: email.trim().toLowerCase() });
  }

  findByExternalIdentity(provider: string, subject: string): Promise<User | null> {
    return this.findOneWhere({ externalProvider: provider, externalSubject: subject });
  }

  findPageConstrained(
    request: PageRequest,
    constraints: UserAccessConstraint[] | null,
  ): Promise<Page<User>> {
    if (!constraints) return this.findPage(request);
    const or = constraints.map((c) =>
      Object.fromEntries(
        Object.entries(c).map(([attr, value]) => [
          CONSTRAINT_COLUMNS[attr] ?? '__invalid__',
          value,
        ]),
      ),
    );
    return this.findPage(request, undefined, { OR: or });
  }

  async findRoles(codes: string[]): Promise<RoleSummary[]> {
    const roles = await this.db.role.findMany({
      where: { code: { in: codes }, deletedAt: null },
      include: { permissions: { include: { permission: { select: { code: true } } } } },
    });
    return roles.map((r) => ({
      code: r.code,
      name: r.name,
      permissions: r.permissions.map((p) => p.permission.code),
    }));
  }

  async findActiveUserIds(filter: UserDirectoryFilter, limit = 1_000): Promise<string[]> {
    const and: object[] = [];
    if (filter.roles?.length) {
      and.push({ roles: { some: { role: { code: { in: filter.roles }, deletedAt: null } } } });
    }
    for (const permission of filter.allPermissions ?? []) {
      and.push({
        roles: {
          some: {
            role: {
              deletedAt: null,
              permissions: { some: { permission: { code: { in: grantingCodes(permission) } } } },
            },
          },
        },
      });
    }
    const rows = await this.db.user.findMany({
      where: {
        deletedAt: null,
        status: { in: ['ACTIVE', 'LOCKED'] },
        id: idCondition(filter),
        AND: and,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  async findContacts(ids: readonly string[]): Promise<UserContact[]> {
    if (ids.length === 0) return [];
    return this.db.user.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: { id: true, username: true, email: true, fullName: true },
    });
  }

  async findPasswordsChangedBetween(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<Array<{ id: string; passwordChangedAt: Date }>> {
    const rows = await this.db.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        passwordHash: { not: null },
        passwordChangedAt: { gte: from, lt: to },
      },
      select: { id: true, passwordChangedAt: true },
      take: limit,
    });
    return rows.map((r) => ({ id: r.id, passwordChangedAt: r.passwordChangedAt! }));
  }

  /** Role links are written in the same transaction as the user row. */
  /** Role assignments are audited; sign-in bookkeeping is not a data change. */
  protected override readonly auditDiff = { ignore: ['lastLoginAt'] };

  protected override auditSnapshot(user: User): AuditSnapshot {
    return { ...super.auditSnapshot(user), roles: [...user.roleCodes].sort(compareCodeUnits) };
  }

  protected override async afterSave(user: User): Promise<void> {
    await this.syncRoles(user);
  }

  protected override async afterUpdate(user: User): Promise<void> {
    await this.syncRoles(user);
  }

  private async syncRoles(user: User): Promise<void> {
    const roles = await this.db.role.findMany({
      where: { code: { in: [...user.roleCodes] }, deletedAt: null },
      select: { id: true },
    });
    await this.db.userRole.deleteMany({
      where: { userId: user.id, roleId: { notIn: roles.map((r) => r.id) } },
    });
    await this.db.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id, assignedBy: user.updatedBy })),
      skipDuplicates: true,
    });
  }
}

/** Permission codes that grant `permission` unscoped: itself, <resource>:* and *. */
function grantingCodes(permission: string): string[] {
  const [resource] = permission.split(':');
  return [...new Set(['*', permission, `${resource}:*`])];
}

/** Password history in its own table (hashes only, pruned to the policy size). */
@Injectable()
export class PrismaPasswordHistoryRepository implements PasswordHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recent(userId: string, count: number): Promise<string[]> {
    if (count <= 0) return [];
    const rows = await this.prisma.db.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: count,
      select: { passwordHash: true },
    });
    return rows.map((r) => r.passwordHash);
  }

  async add(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.db.passwordHistory.create({ data: { userId, passwordHash } });
  }

  async prune(userId: string, keep: number): Promise<void> {
    const stale = await this.prisma.db.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: keep,
      select: { id: true },
    });
    if (stale.length) {
      await this.prisma.db.passwordHistory.deleteMany({
        where: { id: { in: stale.map((r) => r.id) } },
      });
    }
  }
}

/** Prisma id condition of a directory filter (only / excluding). */
function idCondition(filter: UserDirectoryFilter): { in?: string[]; notIn?: string[] } | undefined {
  if (!filter.ids && !filter.excludeIds?.length) return undefined;
  return {
    ...(filter.ids ? { in: filter.ids } : {}),
    ...(filter.excludeIds?.length ? { notIn: filter.excludeIds } : {}),
  };
}
