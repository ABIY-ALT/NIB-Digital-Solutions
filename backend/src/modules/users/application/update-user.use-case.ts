import { Inject, Injectable } from '@nestjs/common';
import {
  SESSION_TERMINATOR,
  type SessionTerminator,
} from '#core/application/ports/session-terminator.port.js';
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
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { grantsUnscoped } from '#modules/authorization/domain/permission.js';
import type { User, UserStatus } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { UserPermissions, userResource } from './user-resource.js';

export interface UpdateUserInput {
  principal: Principal;
  id: string;
  /** Version the client last read — required for optimistic concurrency. */
  version: number;
  fullName?: string;
  email?: string;
  phoneNumber?: string | null;
  branchCode?: string | null;
  status?: UserStatus;
  roles?: string[];
}

@Injectable()
export class UpdateUserUseCase implements UseCase<UpdateUserInput, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(SESSION_TERMINATOR) private readonly sessions: SessionTerminator,
    private readonly authz: AuthorizationService,
  ) {}

  async execute(input: UpdateUserInput): Promise<User> {
    const { principal } = input;
    const updated = await this.tx.run(async () => {
      const user = await this.users.getById(input.id);
      this.authz.assert(principal, UserPermissions.update, userResource(user));
      if (!user.assertVersion(input.version))
        throw new ConcurrencyError('User', user.id, input.version);

      if (input.email && input.email.toLowerCase() !== user.email) {
        const other = await this.users.findByEmail(input.email);
        if (other && other.id !== user.id)
          throw new ConflictError('The email is already registered.', { field: 'email' });
      }

      user.updateProfile(
        {
          fullName: input.fullName,
          email: input.email,
          phoneNumber: input.phoneNumber,
          branchCode: input.branchCode,
        },
        principal.userId,
      );

      if (input.roles) {
        const roles = await this.users.findRoles(input.roles);
        const missing = input.roles.filter((code) => !roles.some((r) => r.code === code));
        if (missing.length)
          throw new ValidationError([
            { field: 'roles', message: `Unknown roles: ${missing.join(', ')}` },
          ]);
        const escalation = roles
          .flatMap((r) => r.permissions)
          .some(
            (perm) =>
              !principal.permissions.some((held) => grantsUnscoped(held, perm) || held === perm),
          );
        if (escalation)
          throw new ForbiddenError('You cannot assign roles with permissions you do not hold.');
        user.assignRoles(input.roles, principal.userId);
      }

      if (input.status && input.status !== user.status)
        user.changeStatus(input.status, principal.userId);

      // Re-check scope after the change (e.g. moving a user out of your branch).
      this.authz.assert(principal, UserPermissions.update, userResource(user));
      return this.users.update(user);
    });

    if (input.status && input.status !== 'ACTIVE') {
      await this.sessions.terminateAllForUser(updated.id, `status:${input.status}`);
    }
    return updated;
  }
}
