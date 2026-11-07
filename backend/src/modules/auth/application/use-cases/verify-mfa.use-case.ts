import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '#core/application/use-case.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import type { AuthenticationOutcome, ClientInfo } from '../auth.results.js';
import {
  AUTH_SETTINGS,
  MFA_CHALLENGE_STORE,
  MFA_PROVIDERS,
  type AuthSettings,
  type MfaChallengeStore,
  type MfaProvider,
} from '../ports/auth.ports.js';
import { AuthenticationFlow } from '../services/authentication-flow.service.js';

export interface VerifyMfaInput extends ClientInfo {
  challengeId: string;
  code: string;
}

/** Completes a pending MFA challenge and starts the session. */
@Injectable()
export class VerifyMfaUseCase implements UseCase<VerifyMfaInput, AuthenticationOutcome> {
  constructor(
    @Inject(MFA_CHALLENGE_STORE) private readonly challenges: MfaChallengeStore,
    @Inject(MFA_PROVIDERS) private readonly providers: MfaProvider[],
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    private readonly flow: AuthenticationFlow,
  ) {}

  async execute(input: VerifyMfaInput): Promise<AuthenticationOutcome> {
    const challenge = await this.challenges.find(input.challengeId);
    if (!challenge || new Date(challenge.expiresAt) <= new Date()) {
      throw new AuthenticationError(ErrorCode.AUTH_MFA_CHALLENGE_INVALID);
    }
    if (challenge.attempts >= this.settings.mfaMaxAttempts) {
      await this.challenges.delete(challenge.id);
      throw new AuthenticationError(ErrorCode.AUTH_MFA_TOO_MANY_ATTEMPTS);
    }

    const provider = this.providers.find((p) => p.method === challenge.method);
    if (!provider) throw new AuthenticationError(ErrorCode.AUTH_MFA_METHOD_UNSUPPORTED);

    const user = await this.users.findById(challenge.userId);
    if (!user || user.loginBlock(new Date())) {
      await this.challenges.delete(challenge.id);
      throw new AuthenticationError(ErrorCode.AUTH_MFA_CHALLENGE_INVALID);
    }

    const valid = await provider.verify(user, input.code, challenge);
    if (!valid) {
      challenge.attempts += 1;
      if (challenge.attempts >= this.settings.mfaMaxAttempts) {
        await this.challenges.delete(challenge.id);
        throw new AuthenticationError(ErrorCode.AUTH_MFA_TOO_MANY_ATTEMPTS);
      }
      await this.challenges.update(challenge);
      throw new AuthenticationError(ErrorCode.AUTH_MFA_INVALID_CODE, {
        details: { remainingAttempts: this.settings.mfaMaxAttempts - challenge.attempts },
      });
    }

    await this.challenges.delete(challenge.id);
    return this.flow.finish(user, challenge.authMethod, challenge.provider, true, input);
  }
}
