import { Injectable } from '@nestjs/common';
import type { Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import type { AuditSnapshot } from '#core/domain/audit-change.js';
import { compareCodeUnits } from '#core/domain/strings.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { Role } from '../domain/role.entity.js';
import type { PermissionDefinition, RoleRepository } from '../domain/role.repository.js';

const roleInclude = {
  permissions: { include: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

type RoleRecord = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;
type RoleWrite = Omit<Prisma.RoleUncheckedCreateInput, 'permissions' | 'users'>;

class RolePersistenceMapper extends PersistenceMapper<Role, RoleRecord, RoleWrite> {
  toDomain(r: RoleRecord): Role {
    return Role.reconstitute(
      {
        id: r.id,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdBy: r.createdBy,
        updatedBy: r.updatedBy,
        version: r.version,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
      },
      {
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissionCodes: r.permissions.map((p) => p.permission.code).sort(compareCodeUnits),
        userCount: r._count.users,
      },
    );
  }

  toPersistence(role: Role): RoleWrite {
    const m = role.metadata;
    const s = role.toSnapshot();
    return {
      id: m.id,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      createdBy: m.createdBy,
      updatedBy: m.updatedBy,
      version: m.version,
      deletedAt: m.deletedAt,
      deletedBy: m.deletedBy,
      code: s.code,
      name: s.name,
      description: s.description,
      isSystem: s.isSystem,
    };
  }
}

@Injectable()
export class PrismaRoleRepository
  extends PrismaBaseRepository<Role, RoleRecord, RoleWrite>
  implements RoleRepository
{
  protected readonly resourceName = 'Role';
  protected readonly mapper = new RolePersistenceMapper();
  protected override readonly include = roleInclude;
  protected readonly querySpec: QuerySpec = {
    sortable: { code: 'code', name: 'name', createdAt: 'createdAt' },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      code: { column: 'code', type: 'string' },
      isSystem: { column: 'isSystem', type: 'boolean' },
    },
    searchable: ['code', 'name', 'description'],
    defaultSort: [{ field: 'name', direction: 'asc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.role;
  }

  findByCode(code: string): Promise<Role | null> {
    return this.findOneWhere({ code: code.trim().toUpperCase() });
  }

  async listPermissions(): Promise<PermissionDefinition[]> {
    const rows = await this.db.permission.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      select: { code: true, description: true },
    });
    return rows;
  }

  /** Permission grants are part of the audited view of a role. */
  protected override auditSnapshot(role: Role): AuditSnapshot {
    return {
      ...super.auditSnapshot(role),
      permissions: [...role.permissionCodes].sort(compareCodeUnits),
    };
  }

  protected override async afterSave(role: Role): Promise<void> {
    await this.syncPermissions(role);
  }

  protected override async afterUpdate(role: Role): Promise<void> {
    await this.syncPermissions(role);
  }

  /** Role → permission links, written in the same transaction as the role row. */
  private async syncPermissions(role: Role): Promise<void> {
    const perms = await this.db.permission.findMany({
      where: { code: { in: [...role.permissionCodes] }, deletedAt: null },
      select: { id: true },
    });
    await this.db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: perms.map((p) => p.id) } },
    });
    await this.db.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}
