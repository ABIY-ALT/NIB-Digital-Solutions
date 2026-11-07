import { Inject, Injectable } from '@nestjs/common';
import { AppEvents, type PasswordChangedEvent } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import type { UseCase } from '#core/application/use-case.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { PasswordPolicyService } from '#modules/users/application/password-policy.service.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import type { AuthenticationOutcome, ClientInfo } from '../auth.results.js';
import { PASSWORD_CHANGE_STORE, type PasswordChangeChallengeStore } from '../ports/auth.ports.js';
import { AuthenticationFlow } from '../services/authentication-flow.service.js';

export interface CompletePasswordChangeInput extends ClientInfo {
  changeToken: string;
  newPassword: string;
}

/**
 * Second step of a sign-in whose password expired or was set by an
 * administrator: the user proved their identity (and MFA) already; they must
 * now choose a policy-compliant password before a session is issued.
 */
@Injectable()
export class CompletePasswordChangeUseCase implements UseCase<
  CompletePasswordChangeInput,
  AuthenticationOutcome
> {
  constructor(
    @Inject(PASSWORD_CHANGE_STORE) private readonly challenges: PasswordChangeChallengeStore,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    private readonly passwords: PasswordPolicyService,
    private readonly flow: AuthenticationFlow,
  ) {}

  async execute(input: CompletePasswordChangeInput): Promise<AuthenticationOutcome> {
    const challenge = await this.challenges.find(input.changeToken);
    if (!challenge || new Date(challenge.expiresAt) <= new Date()) {
      throw new AuthenticationError(ErrorCode.AUTH_PASSWORD_CHANGE_INVALID);
    }
    const user = await this.users.findById(challenge.userId);
    if (!user || user.loginBlock(new Date())) {
      await this.challenges.delete(challenge.id);
      throw new AuthenticationError(ErrorCode.AUTH_PASSWORD_CHANGE_INVALID);
    }

    await this.passwords.assertAcceptable(input.newPassword, 'newPassword', user, user);
    const outgoing = user.passwordHash;
    user.replacePasswordHash(await this.hasher.hash(input.newPassword), user.id);
    const saved = await this.users.update(user);
    await this.passwords.remember(saved, outgoing);
    await this.challenges.delete(challenge.id);
    await this.events.publish<PasswordChangedEvent>({
      name: AppEvents.PasswordChanged,
      payload: { userId: user.id, via: challenge.reason === 'RESET' ? 'reset' : 'expired' },
      actorId: user.id,
    });

    return this.flow.startSession(
      saved,
      challenge.authMethod,
      challenge.provider,
      challenge.mfaVerified,
      input,
    );
  }
}
