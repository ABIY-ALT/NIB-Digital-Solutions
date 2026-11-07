import { Inject, Injectable } from '@nestjs/common';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { ConflictError, ForbiddenError, ValidationError } from '#core/domain/errors/app-error.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import { grantsUnscoped } from '#modules/authorization/domain/permission.js';
import { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { PasswordPolicyService } from './password-policy.service.js';
import { UserPermissions, userResource } from './user-resource.js';

export interface CreateUserInput {
  principal: Principal;
  username: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  password: string;
  branchCode?: string | null;
  roles: string[];
}

/**
 * Creates a user with roles in ONE transaction (user row + role links).
 * Guards against privilege escalation: a caller can only assign roles whose
 * permissions they themselves hold.
 */
@Injectable()
export class CreateUserUseCase implements UseCase<CreateUserInput, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    private readonly authz: AuthorizationService,
    private readonly passwords: PasswordPolicyService,
  ) {}

  async execute(input: CreateUserInput): Promise<User> {
    const { principal } = input;
    await this.passwords.assertAcceptable(input.password, 'password', {
      username: input.username,
      email: input.email,
      fullName: input.fullName,
    });
    const passwordHash = await this.hasher.hash(input.password);

    return this.tx.run(async () => {
      const [byUsername, byEmail] = await Promise.all([
        this.users.findByUsername(input.username),
        this.users.findByEmail(input.email),
      ]);
      if (byUsername)
        throw new ConflictError('The username is already taken.', { field: 'username' });
      if (byEmail) throw new ConflictError('The email is already registered.', { field: 'email' });

      const roles = await this.users.findRoles(input.roles);
      const missing = input.roles.filter((code) => !roles.some((r) => r.code === code));
      if (missing.length)
        throw new ValidationError([
          { field: 'roles', message: `Unknown roles: ${missing.join(', ')}` },
        ]);

      const escalation = roles
        .flatMap((r) => r.permissions)
        .filter(
          (perm) =>
            !principal.permissions.some((held) => grantsUnscoped(held, perm) || held === perm),
        );
      if (escalation.length) {
        this.authz.recordDenial(principal, `assign:${escalation.join(',')}`);
        throw new ForbiddenError('You cannot assign roles with permissions you do not hold.');
      }

      const user = User.create(
        {
          username: input.username,
          email: input.email,
          fullName: input.fullName,
          phoneNumber: input.phoneNumber,
          passwordHash,
          branchCode: input.branchCode,
          roleCodes: input.roles,
          // An administrator chose this password: the user replaces it at first sign-in.
          passwordMustChange: this.passwords.policy.password.changeOnFirstLogin,
        },
        principal.userId,
      );
      // Branch-scoped creators may only create users in their own branch.
      this.authz.assert(principal, UserPermissions.create, userResource(user));
      return this.users.save(user);
    });
  }
}
