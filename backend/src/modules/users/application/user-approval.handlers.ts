import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import { ConcurrencyError } from '#core/domain/errors/app-error.js';
import { compareCodeUnits } from '#core/domain/strings.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { DeleteUserUseCase } from './delete-user.use-case.js';
import { UpdateUserUseCase, type UpdateUserInput } from './update-user.use-case.js';
import { UserPermissions, userResource } from './user-resource.js';

/** Reviewer's view of a user (no credentials, no MFA secrets). */
export const userView = (u: User) => ({
  username: u.username,
  fullName: u.fullName,
  email: u.email,
  phoneNumber: u.phoneNumber,
  branchCode: u.branchCode,
  status: u.status,
  roles: [...u.roleCodes].sort(compareCodeUnits),
});

type UpdatePayload = Omit<UpdateUserInput, 'principal'>;

/**
 * Maker–checker handlers for user administration. Credentials never go
 * through approvals (a stored request must not contain a password), so user
 * creation and password resets are intentionally not approval actions.
 */
@Injectable()
export class UserApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  onModuleInit(): void {
    const update: ApprovalHandler<UpdatePayload> = {
      action: 'users.update',
      resourceType: 'User',
      checkerPermissions: [UserPermissions.update],
      describe: async (p, maker) => {
        const user = await this.users.getById(p.id);
        this.authz.assert(maker, UserPermissions.update, userResource(user));
        if (!user.assertVersion(p.version)) throw new ConcurrencyError('User', user.id, p.version);
        const before = userView(user);
        const after = {
          ...before,
          ...Object.fromEntries(
            Object.entries({
              fullName: p.fullName,
              email: p.email?.toLowerCase(),
              phoneNumber: p.phoneNumber,
              branchCode: p.branchCode,
              status: p.status,
              roles: p.roles ? [...p.roles].sort(compareCodeUnits) : undefined,
            }).filter(([, v]) => v !== undefined),
          ),
        };
        return { resourceId: user.id, summary: `Update user ${user.username}`, before, after };
      },
      execute: async (p, maker) =>
        userView(await this.updateUser.execute({ principal: maker, ...p })),
    };

    const remove: ApprovalHandler<{ id: string; version?: number }> = {
      action: 'users.delete',
      resourceType: 'User',
      checkerPermissions: [UserPermissions.delete],
      describe: async (p, maker) => {
        const user = await this.users.getById(p.id);
        this.authz.assert(maker, UserPermissions.delete, userResource(user));
        if (!user.assertVersion(p.version)) {
          throw new ConcurrencyError('User', user.id, p.version ?? -1);
        }
        const before = userView(user);
        user.softDelete(maker.userId); // validates (e.g. not yourself)
        return {
          resourceId: user.id,
          summary: `Delete user ${before.username}`,
          before,
          after: null,
        };
      },
      execute: async (p, maker) =>
        userView(await this.deleteUser.execute({ principal: maker, ...p })),
    };

    this.gate.register(update);
    this.gate.register(remove);
  }
}
