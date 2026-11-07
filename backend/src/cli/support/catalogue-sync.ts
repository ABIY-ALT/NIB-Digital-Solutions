import type { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type { SystemRoleDefinition } from '#modules/authorization/domain/permission-catalogue.js';

export interface CatalogueState {
  permissions: Array<{
    code: string;
    description: string | null;
    deleted: boolean;
    roleCount: number;
  }>;
  roles: Array<{ code: string; isSystem: boolean; permissions: string[] }>;
}

export interface CatalogueSyncPlan {
  /** In the code catalogue, missing from (or soft-deleted in) the database. */
  createPermissions: Array<{ code: string; description: string }>;
  /** Present, but the description changed in code. */
  updatePermissions: Array<{ code: string; description: string }>;
  /** In the database but no longer in the code catalogue. */
  orphanPermissions: Array<{ code: string; roleCount: number; pruned: boolean }>;
  /** Standard roles that do not exist yet (created with their default permissions). */
  createRoles: Array<{ code: string; permissions: string[] }>;
  /** Standard roles whose permissions differ from the defaults. */
  driftedRoles: Array<{ code: string; missing: string[]; extra: string[]; reset: boolean }>;
}

export interface CatalogueSyncOptions {
  /** Soft-delete orphan permissions that no role uses any more. */
  prune: boolean;
  /** Put the standard roles back to their default permissions. */
  resetRoles: boolean;
}

export const isEmptyPlan = (plan: CatalogueSyncPlan): boolean =>
  plan.createPermissions.length === 0 &&
  plan.updatePermissions.length === 0 &&
  plan.createRoles.length === 0 &&
  !plan.orphanPermissions.some((p) => p.pruned) &&
  !plan.driftedRoles.some((r) => r.reset);

/**
 * Compares the code catalogue with the database. Pure: no I/O, so the plan can
 * be shown (--dry-run) and tested before anything is written.
 *
 * Deliberately conservative: an existing role's permissions are an
 * administrator's decision and are only reported as drift, never overwritten,
 * unless `resetRoles` is set.
 */
export function planCatalogueSync(
  catalogue: Readonly<Record<string, string>>,
  systemRoles: Readonly<Record<string, SystemRoleDefinition>>,
  state: CatalogueState,
  options: CatalogueSyncOptions,
): CatalogueSyncPlan {
  for (const [code, role] of Object.entries(systemRoles)) {
    const unknown = role.permissions.filter((p) => !(p in catalogue));
    if (unknown.length) {
      throw new Error(
        `Role ${code} grants permissions that are not in the catalogue: ${unknown.join(', ')}`,
      );
    }
  }
  return {
    ...planPermissions(catalogue, state, options),
    ...planRoles(systemRoles, state, options),
  };
}

function planPermissions(
  catalogue: Readonly<Record<string, string>>,
  state: CatalogueState,
  options: CatalogueSyncOptions,
): Pick<CatalogueSyncPlan, 'createPermissions' | 'updatePermissions' | 'orphanPermissions'> {
  const existing = new Map(state.permissions.map((p) => [p.code, p]));
  const plan: ReturnType<typeof planPermissions> = {
    createPermissions: [],
    updatePermissions: [],
    orphanPermissions: [],
  };
  for (const [code, description] of Object.entries(catalogue)) {
    const current = existing.get(code);
    if (!current || current.deleted) plan.createPermissions.push({ code, description });
    else if (current.description !== description) {
      plan.updatePermissions.push({ code, description });
    }
  }
  for (const permission of state.permissions) {
    if (permission.code in catalogue || permission.deleted) continue;
    plan.orphanPermissions.push({
      code: permission.code,
      roleCount: permission.roleCount,
      pruned: options.prune && permission.roleCount === 0,
    });
  }
  return plan;
}

function planRoles(
  systemRoles: Readonly<Record<string, SystemRoleDefinition>>,
  state: CatalogueState,
  options: CatalogueSyncOptions,
): Pick<CatalogueSyncPlan, 'createRoles' | 'driftedRoles'> {
  const roles = new Map(state.roles.map((r) => [r.code, r]));
  const plan: ReturnType<typeof planRoles> = { createRoles: [], driftedRoles: [] };
  for (const [code, definition] of Object.entries(systemRoles)) {
    const current = roles.get(code);
    if (!current) {
      plan.createRoles.push({ code, permissions: [...definition.permissions] });
      continue;
    }
    const held = new Set(current.permissions);
    const wanted = new Set(definition.permissions);
    const missing = definition.permissions.filter((p) => !held.has(p));
    const extra = current.permissions.filter((p) => !wanted.has(p));
    if (missing.length || extra.length) {
      plan.driftedRoles.push({ code, missing, extra, reset: options.resetRoles });
    }
  }
  return plan;
}

export async function readCatalogueState(prisma: PrismaService): Promise<CatalogueState> {
  const [permissions, roles] = await Promise.all([
    prisma.db.permission.findMany({
      orderBy: { code: 'asc' },
      select: {
        code: true,
        description: true,
        deletedAt: true,
        _count: { select: { roles: true } },
      },
    }),
    prisma.db.role.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      select: {
        code: true,
        isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    }),
  ]);
  return {
    permissions: permissions.map((p) => ({
      code: p.code,
      description: p.description,
      deleted: p.deletedAt !== null,
      roleCount: p._count.roles,
    })),
    roles: roles.map((r) => ({
      code: r.code,
      isSystem: r.isSystem,
      permissions: r.permissions.map((link) => link.permission.code).sort(),
    })),
  };
}

/** Applies a plan in ONE transaction: the catalogue is never left half-updated. */
export async function applyCatalogueSync(
  prisma: PrismaService,
  plan: CatalogueSyncPlan,
  systemRoles: Readonly<Record<string, SystemRoleDefinition>>,
  actorId: string,
): Promise<void> {
  await prisma.transaction(async () => {
    const db = prisma.db;
    for (const { code, description } of [...plan.createPermissions, ...plan.updatePermissions]) {
      await db.permission.upsert({
        where: { code },
        update: { description, deletedAt: null, deletedBy: null, updatedBy: actorId },
        create: { code, description, createdBy: actorId, updatedBy: actorId },
      });
    }
    const pruned = plan.orphanPermissions.filter((p) => p.pruned).map((p) => p.code);
    if (pruned.length) {
      await db.permission.updateMany({
        where: { code: { in: pruned } },
        data: { deletedAt: new Date(), deletedBy: actorId },
      });
    }

    const setPermissions = async (roleId: string, codes: readonly string[]): Promise<void> => {
      const permissions = await db.permission.findMany({
        where: { code: { in: [...codes] }, deletedAt: null },
        select: { id: true },
      });
      await db.rolePermission.deleteMany({ where: { roleId } });
      await db.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      });
    };

    for (const { code } of plan.createRoles) {
      const definition = systemRoles[code]!;
      const role = await db.role.create({
        data: {
          code,
          name: definition.name,
          description: definition.description,
          isSystem: true,
          createdBy: actorId,
          updatedBy: actorId,
        },
        select: { id: true },
      });
      await setPermissions(role.id, definition.permissions);
    }
    for (const { code } of plan.driftedRoles.filter((r) => r.reset)) {
      const role = await db.role.update({
        where: { code },
        data: { updatedBy: actorId, version: { increment: 1 } },
        select: { id: true },
      });
      await setPermissions(role.id, systemRoles[code]!.permissions);
    }
  });
}
