import { Inject, Injectable } from '@nestjs/common';
import { AppEvents, type AccountLockedEvent } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import {
  AUTH_SETTINGS,
  type AuthSettings,
  type IdentityProvider,
  type IdentityRequest,
  type VerifiedIdentity,
} from '../ports/auth.ports.js';

/**
 * Username + password against the AppCore user store.
 *
 *   • constant-ish timing for unknown users (a dummy hash is verified)
 *   • generic error for unknown user / wrong password (no account enumeration)
 *   • failed-attempt counting and temporary lockout
 *   • transparent re-hash when Argon2 parameters are upgraded
 */
@Injectable()
export class LocalPasswordIdentityProvider implements IdentityProvider {
  readonly id = 'local';
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  supports(request: IdentityRequest): boolean {
    return request.type === 'password';
  }

  async authenticate(request: IdentityRequest): Promise<VerifiedIdentity> {
    if (request.type !== 'password')
      throw new AuthenticationError(ErrorCode.AUTH_PROVIDER_UNAVAILABLE);
    const now = new Date();
    const user = await this.users.findByUsername(request.username);

    if (!user?.passwordHash) {
      this.dummyHash ??= this.hasher.hash('appcore-timing-equaliser');
      await this.hasher.verify(await this.dummyHash, request.password);
      throw new AuthenticationError(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    const block = user.loginBlock(now);
    if (block === 'DISABLED') throw new AuthenticationError(ErrorCode.AUTH_ACCOUNT_DISABLED);
    if (block === 'LOCKED') {
      throw new AuthenticationError(ErrorCode.AUTH_ACCOUNT_LOCKED, {
        details: user.lockedUntil ? { lockedUntil: user.lockedUntil.toISOString() } : undefined,
      });
    }

    const valid = await this.hasher.verify(user.passwordHash, request.password);
    if (!valid) {
      const locked = user.registerFailedLogin(
        this.settings.maxFailedAttempts,
        this.settings.lockoutMinutes,
        now,
      );
      await this.users.update(user);
      if (locked) {
        await this.events.publish<AccountLockedEvent>({
          name: AppEvents.AccountLocked,
          payload: {
            userId: user.id,
            username: user.username,
            until: user.lockedUntil?.toISOString() ?? null,
          },
          actorId: null,
        });
      }
      throw new AuthenticationError(
        locked ? ErrorCode.AUTH_ACCOUNT_LOCKED : ErrorCode.AUTH_INVALID_CREDENTIALS,
      );
    }

    if (this.hasher.needsRehash(user.passwordHash)) {
      // Algorithm upgrade only: the password itself (age, temporary state) is unchanged.
      user.replacePasswordHash(await this.hasher.hash(request.password), user.id, {
        preserveChangedAt: true,
        mustChange: user.passwordMustChange,
      });
    }
    user.registerSuccessfulLogin(now);
    const saved = await this.users.update(user);
    return { user: saved, method: 'password', provider: this.id, mfaSatisfied: false };
  }
}
