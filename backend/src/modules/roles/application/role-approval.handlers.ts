import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalDescription,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { ConcurrencyError, ConflictError } from '#core/domain/errors/app-error.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { Role } from '../domain/role.entity.js';
import { ROLE_REPOSITORY, type RoleRepository } from '../domain/role.repository.js';
import {
  assertKnownAndGrantable,
  CreateRoleUseCase,
  DeleteRoleUseCase,
  UpdateRoleUseCase,
  type CreateRoleInput,
  type UpdateRoleInput,
} from './role.use-cases.js';

/** What reviewers see of a role (before / after). */
export const roleView = (r: Role) => ({
  code: r.code,
  name: r.name,
  description: r.description,
  permissions: [...r.permissionCodes],
});

type CreatePayload = Omit<CreateRoleInput, 'principal'>;
type UpdatePayload = Omit<UpdateRoleInput, 'principal'>;
type DeletePayload = { id: string };

/**
 * Maker–checker handlers for role administration. `describe` runs the same
 * checks as the use case (on a throw-away copy) so invalid requests are
 * rejected at submission; `execute` runs the real use case as the maker.
 */
@Injectable()
export class RoleApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly authz: AuthorizationService,
    private readonly createRole: CreateRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<CreatePayload> = {
      action: 'roles.create',
      resourceType: 'Role',
      checkerPermissions: ['roles:create'],
      describe: async (p, maker) => {
        if (await this.roles.findByCode(p.code)) {
          throw new ConflictError('A role with this code already exists.', { field: 'code' });
        }
        await assertKnownAndGrantable(this.roles, this.authz, maker, p.permissions);
        const draft = Role.create(
          {
            code: p.code,
            name: p.name,
            description: p.description,
            permissionCodes: p.permissions,
          },
          maker.userId,
        );
        return {
          resourceId: null,
          summary: `Create role ${draft.name} (${draft.code})`,
          before: null,
          after: roleView(draft),
        };
      },
      execute: async (p, maker) =>
        roleView(await this.createRole.execute({ principal: maker, ...p })),
    };

    const update: ApprovalHandler<UpdatePayload> = {
      action: 'roles.update',
      resourceType: 'Role',
      checkerPermissions: ['roles:update'],
      describe: async (p, maker) => {
        const role = await this.roles.getById(p.id);
        if (!role.assertVersion(p.version)) throw new ConcurrencyError('Role', role.id, p.version);
        const before = roleView(role);
        if (p.permissions) {
          const added = p.permissions.filter((x) => !role.permissionCodes.includes(x));
          await assertKnownAndGrantable(this.roles, this.authz, maker, added);
        }
        role.update(
          { name: p.name, description: p.description, permissionCodes: p.permissions },
          maker.userId,
        );
        return {
          resourceId: role.id,
          summary: `Update role ${before.name}`,
          before,
          after: roleView(role),
        };
      },
      execute: async (p, maker) =>
        roleView(await this.updateRole.execute({ principal: maker, ...p })),
    };

    const remove: ApprovalHandler<DeletePayload> = {
      action: 'roles.delete',
      resourceType: 'Role',
      checkerPermissions: ['roles:delete'],
      describe: async (p, maker): Promise<ApprovalDescription> => {
        const role = await this.roles.getById(p.id);
        const before = roleView(role);
        role.softDelete(maker.userId); // validates: not a system role, not in use
        return { resourceId: role.id, summary: `Delete role ${before.name}`, before, after: null };
      },
      execute: async (p, maker: Principal) =>
        roleView(await this.deleteRole.execute({ principal: maker, id: p.id })),
    };

    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
