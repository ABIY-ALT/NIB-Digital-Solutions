import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import {
  ConcurrencyError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { grantsUnscoped } from '#modules/authorization/domain/permission.js';
import { Role } from '../domain/role.entity.js';
import {
  ROLE_REPOSITORY,
  type PermissionDefinition,
  type RoleRepository,
} from '../domain/role.repository.js';

/**
 * Role management use cases (one class per operation). Every change that grants
 * permissions is checked against the caller's own permissions so nobody can
 * create or widen a role beyond what they hold themselves.
 */

export async function assertKnownAndGrantable(
  repo: RoleRepository,
  authz: AuthorizationService,
  principal: Principal,
  codes: string[],
): Promise<void> {
  const catalogue = new Set((await repo.listPermissions()).map((p) => p.code));
  const unknown = codes.filter((c) => !catalogue.has(c));
  if (unknown.length) {
    throw new ValidationError([
      { field: 'permissions', message: `Unknown permissions: ${unknown.join(', ')}` },
    ]);
  }
  const notHeld = codes.filter(
    (perm) => !principal.permissions.some((held) => held === perm || grantsUnscoped(held, perm)),
  );
  if (notHeld.length) {
    authz.recordDenial(principal, `grant:${notHeld.join(',')}`);
    throw new ForbiddenError('You cannot grant permissions you do not hold.');
  }
}

@Injectable()
export class ListRolesUseCase implements UseCase<PageRequest, Page<Role>> {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository) {}

  execute(request: PageRequest): Promise<Page<Role>> {
    return this.roles.findPage(request);
  }
}

@Injectable()
export class GetRoleUseCase implements UseCase<string, Role> {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository) {}

  execute(id: string): Promise<Role> {
    return this.roles.getById(id);
  }
}

@Injectable()
export class ListPermissionsUseCase implements UseCase<void, PermissionDefinition[]> {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository) {}

  execute(): Promise<PermissionDefinition[]> {
    return this.roles.listPermissions();
  }
}

export interface CreateRoleInput {
  principal: Principal;
  code: string;
  name: string;
  description?: string | null;
  permissions: string[];
}

@Injectable()
export class CreateRoleUseCase implements UseCase<CreateRoleInput, Role> {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    private readonly authz: AuthorizationService,
  ) {}

  execute(input: CreateRoleInput): Promise<Role> {
    return this.tx.run(async () => {
      if (await this.roles.findByCode(input.code)) {
        throw new ConflictError('A role with this code already exists.', { field: 'code' });
      }
      await assertKnownAndGrantable(this.roles, this.authz, input.principal, input.permissions);
      const role = Role.create(
        {
          code: input.code,
          name: input.name,
          description: input.description,
          permissionCodes: input.permissions,
        },
        input.principal.userId,
      );
      return this.roles.save(role);
    });
  }
}

export interface UpdateRoleInput {
  principal: Principal;
  id: string;
  version: number;
  name?: string;
  description?: string | null;
  permissions?: string[];
}

@Injectable()
export class UpdateRoleUseCase implements UseCase<UpdateRoleInput, Role> {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    private readonly authz: AuthorizationService,
  ) {}

  execute(input: UpdateRoleInput): Promise<Role> {
    return this.tx.run(async () => {
      const role = await this.roles.getById(input.id);
      if (!role.assertVersion(input.version))
        throw new ConcurrencyError('Role', role.id, input.version);
      if (input.permissions) {
        const added = input.permissions.filter((p) => !role.permissionCodes.includes(p));
        await assertKnownAndGrantable(this.roles, this.authz, input.principal, added);
      }
      role.update(
        { name: input.name, description: input.description, permissionCodes: input.permissions },
        input.principal.userId,
      );
      return this.roles.update(role);
    });
  }
}

@Injectable()
export class DeleteRoleUseCase implements UseCase<{ principal: Principal; id: string }, Role> {
  constructor(@Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<Role> {
    const role = await this.roles.getById(id);
    return this.roles.softDelete(role, principal.userId);
  }
}
