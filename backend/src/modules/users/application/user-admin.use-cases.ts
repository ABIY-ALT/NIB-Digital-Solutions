import { Inject, Injectable } from '@nestjs/common';
import { AppEvents, type PasswordResetEvent } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import {
  SESSION_TERMINATOR,
  type SessionTerminator,
} from '#core/application/ports/session-terminator.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { BusinessRuleError } from '#core/domain/errors/app-error.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { PasswordPolicyService } from './password-policy.service.js';
import { UserPermissions, userResource } from './user-resource.js';

/** Administrator actions on another user's account. */

@Injectable()
export class UnlockUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async execute(principal: Principal, id: string): Promise<User> {
    const user = await this.users.getById(id);
    this.authz.assert(principal, UserPermissions.update, userResource(user));
    if (user.status !== 'LOCKED' && !user.lockedUntil) {
      throw new BusinessRuleError('The account is not locked.', 'NOT_LOCKED');
    }
    user.changeStatus('ACTIVE', principal.userId);
    return this.users.update(user);
  }
}

@Injectable()
export class ResetUserPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SESSION_TERMINATOR) private readonly sessions: SessionTerminator,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    private readonly authz: AuthorizationService,
    private readonly passwords: PasswordPolicyService,
  ) {}

  /**
   * Sets a temporary password (policy-checked), ends the user's sessions and,
   * per policy, forces a new password at their next sign-in.
   */
  async execute(principal: Principal, id: string, newPassword: string): Promise<User> {
    const user = await this.users.getById(id);
    this.authz.assert(principal, 'users:reset-password', userResource(user));
    if (user.id === principal.userId) {
      throw new BusinessRuleError('Use "Change password" for your own account.', 'SELF_RESET');
    }
    await this.passwords.assertAcceptable(newPassword, 'newPassword', user);
    const outgoing = user.passwordHash;
    user.replacePasswordHash(await this.hasher.hash(newPassword), principal.userId, {
      mustChange: this.passwords.policy.password.changeOnFirstLogin,
    });
    const saved = await this.users.update(user);
    await this.passwords.remember(saved, outgoing);
    await this.sessions.terminateAllForUser(id, 'password_reset');
    await this.events.publish<PasswordResetEvent>({
      name: AppEvents.PasswordReset,
      payload: { userId: id, byName: principal.username },
    });
    return saved;
  }
}

@Injectable()
export class EndUserSessionsUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_TERMINATOR) private readonly sessions: SessionTerminator,
    private readonly authz: AuthorizationService,
  ) {}

  async execute(principal: Principal, id: string): Promise<{ terminated: number }> {
    const user = await this.users.getById(id);
    this.authz.assert(principal, UserPermissions.update, userResource(user));
    return { terminated: await this.sessions.terminateAllForUser(id, 'admin_request') };
  }
}
