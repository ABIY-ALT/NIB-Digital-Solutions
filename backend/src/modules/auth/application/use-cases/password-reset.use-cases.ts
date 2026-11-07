import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppEvents, type PasswordChangedEvent } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import { MAILER, type Mailer } from '#core/application/ports/mail.port.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import {
  SESSION_TERMINATOR,
  type SessionTerminator,
} from '#core/application/ports/session-terminator.port.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { PasswordPolicyService } from '#modules/users/application/password-policy.service.js';
import type { User } from '#modules/users/domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import {
  AUTH_SETTINGS,
  PASSWORD_RESET_STORE,
  type AuthSettings,
  type PasswordResetStore,
} from '../ports/auth.ports.js';

/** Only the SHA-256 of the e-mailed token is stored: a store dump cannot reset a password. */
export const hashResetToken = (token: string): string =>
  createHash('sha256').update(token).digest('base64url');

/**
 * Self-service recovery applies to accounts that sign in with a local
 * password and are not switched off. A temporary lock (too many wrong
 * passwords) is exactly what the user is trying to get out of; an
 * administrative lock is not theirs to lift.
 */
function canRecover(user: User | null): user is User {
  if (!user?.passwordHash) return false;
  const block = user.loginBlock(new Date());
  if (block === 'DISABLED') return false;
  return !(block === 'LOCKED' && !user.lockedUntil);
}

@Injectable()
export class RequestPasswordResetUseCase {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_STORE) private readonly resets: PasswordResetStore,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  /**
   * Always resolves the same way and at once: whether the account exists, can
   * be recovered or was just e-mailed is never visible to the caller (no user
   * enumeration by response or by timing). The work continues in the background.
   */
  execute(input: { identifier: string }): Promise<void> {
    if (this.settings.passwordReset.enabled) {
      void this.deliver(input.identifier).catch((error: unknown) =>
        this.logger.warn({ err: error }, 'Password reset e-mail could not be sent'),
      );
    }
    return Promise.resolve();
  }

  private async deliver(identifier: string): Promise<void> {
    const user = identifier.includes('@')
      ? await this.users.findByEmail(identifier)
      : await this.users.findByUsername(identifier);
    if (!canRecover(user)) return;

    const { ttlSeconds, cooldownSeconds, publicUrl } = this.settings.passwordReset;
    // One e-mail per cooldown: the form cannot be used to flood someone's inbox.
    if (!(await this.resets.acquireCooldown(user.id, cooldownSeconds))) return;

    const token = randomBytes(32).toString('base64url');
    await this.resets.issue(user.id, hashResetToken(token), ttlSeconds);
    const minutes = Math.round(ttlSeconds / 60);
    await this.mailer.send({
      to: user.email,
      toName: user.fullName,
      subject: 'Reset your password',
      paragraphs: [
        `We received a request to reset the password of your account (${user.username}).`,
        'Use the button below to choose a new password. Your current password keeps working until you do.',
      ],
      action: {
        label: 'Choose a new password',
        url: `${publicUrl}/reset-password?token=${token}`,
      },
      note: `The link can be used once and expires in ${minutes} minutes. If you did not ask for it, ignore this e-mail and tell the security team.`,
    });
  }
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_STORE) private readonly resets: PasswordResetStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SESSION_TERMINATOR) private readonly sessions: SessionTerminator,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    private readonly passwords: PasswordPolicyService,
  ) {}

  /**
   * Sets the new password for the account the token was issued to, ends every
   * session of that account and lifts a temporary lock. No session is issued:
   * the user signs in normally afterwards, so MFA still applies.
   */
  async execute(input: { token: string; newPassword: string }): Promise<{ userId: string }> {
    const invalid = (): AuthenticationError =>
      new AuthenticationError(ErrorCode.AUTH_PASSWORD_RESET_INVALID);
    if (!this.settings.passwordReset.enabled) throw invalid();

    const tokenHash = hashResetToken(input.token);
    const userId = await this.resets.find(tokenHash);
    if (!userId) throw invalid();
    const user = await this.users.findById(userId);
    if (!canRecover(user)) {
      await this.resets.revoke(userId);
      throw invalid();
    }

    // A rejected password (policy) leaves the link usable for another try.
    await this.passwords.assertAcceptable(input.newPassword, 'newPassword', user, user);
    // Single use: only the request that removes the token may go on.
    if (!(await this.resets.consume(tokenHash))) throw invalid();

    const outgoing = user.passwordHash;
    user.replacePasswordHash(await this.hasher.hash(input.newPassword), user.id);
    if (user.lockedUntil) user.changeStatus('ACTIVE', user.id);
    const saved = await this.users.update(user);
    await this.passwords.remember(saved, outgoing);
    await this.resets.revoke(user.id);
    await this.sessions.terminateAllForUser(user.id, 'password_reset');
    await this.events.publish<PasswordChangedEvent>({
      name: AppEvents.PasswordChanged,
      payload: { userId: user.id, via: 'recovery' },
      actorId: user.id,
    });
    return { userId: user.id };
  }
}
