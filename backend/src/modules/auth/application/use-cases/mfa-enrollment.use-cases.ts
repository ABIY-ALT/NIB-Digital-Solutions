import { Inject, Injectable } from '@nestjs/common';
import { AppEvents, type MfaChangedEvent } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { AuthenticationError, BusinessRuleError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import {
  MFA_ENROLLMENT,
  type MfaEnrollmentService,
  type TotpEnrollment,
} from '../ports/mfa-enrollment.port.js';

/** Step 1: generate a TOTP secret for the user to add to an authenticator app. */
@Injectable()
export class BeginTotpEnrollmentUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MFA_ENROLLMENT) private readonly enrollment: MfaEnrollmentService,
  ) {}

  async execute(principal: Principal): Promise<TotpEnrollment> {
    const user = await this.users.getById(principal.userId);
    if (user.mfaEnabled && user.mfaMethod === 'TOTP') {
      throw new BusinessRuleError('An authenticator app is already set up.', 'MFA_ALREADY_ENABLED');
    }
    return this.enrollment.begin(user.id, user.email || user.username);
  }
}

/** Step 2: prove possession with a code; the secret is then stored (encrypted). */
@Injectable()
export class ConfirmTotpEnrollmentUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MFA_ENROLLMENT) private readonly enrollment: MfaEnrollmentService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async execute(principal: Principal, code: string): Promise<void> {
    const encryptedSecret = await this.enrollment.confirm(principal.userId, code);
    if (!encryptedSecret) throw new AuthenticationError(ErrorCode.AUTH_MFA_INVALID_CODE);
    const user = await this.users.getById(principal.userId);
    user.enableMfa('TOTP', encryptedSecret, principal.userId);
    await this.users.update(user);
    await this.events.publish<MfaChangedEvent>({
      name: AppEvents.MfaChanged,
      payload: { userId: user.id, enabled: true, method: 'TOTP' },
    });
  }
}

/** Turns MFA off. Requires the password so a hijacked session cannot do it. */
@Injectable()
export class DisableMfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async execute(principal: Principal, password: string): Promise<void> {
    const user = await this.users.getById(principal.userId);
    if (!user.mfaEnabled) return;
    if (!user.passwordHash || !(await this.hasher.verify(user.passwordHash, password))) {
      throw new AuthenticationError(ErrorCode.AUTH_INVALID_CREDENTIALS, {
        message: 'The password is incorrect.',
      });
    }
    const method = user.mfaMethod;
    user.disableMfa(principal.userId);
    await this.users.update(user);
    await this.events.publish<MfaChangedEvent>({
      name: AppEvents.MfaChanged,
      payload: { userId: user.id, enabled: false, method },
    });
  }
}
