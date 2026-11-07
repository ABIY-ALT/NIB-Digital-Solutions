import { Inject, Injectable } from '@nestjs/common';
import { AppEvents, type PasswordChangedEvent } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import type { Principal } from '#core/application/security/principal.js';
import {
  AuthenticationError,
  BusinessRuleError,
  NotFoundError,
} from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { PasswordPolicyService } from '#modules/users/application/password-policy.service.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import { SESSION_STORE, type SessionStore } from '../ports/auth.ports.js';

/**
 * Self-service account use cases: the signed-in user managing their own
 * sessions, password and second factor.
 */

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionView {
  id: string;
  current: boolean;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  authMethod: string;
  mfaVerified: boolean;
}

@Injectable()
export class ListMySessionsUseCase {
  constructor(@Inject(SESSION_STORE) private readonly sessions: SessionStore) {}

  async execute(principal: Principal): Promise<SessionView[]> {
    const sessions = await this.sessions.listForUser(principal.userId);
    return sessions
      .map((s) => {
        const p = s.toJSON();
        return {
          id: p.id,
          current: p.id === principal.sessionId,
          createdAt: p.createdAt,
          lastActivityAt: p.lastActivityAt,
          expiresAt: p.expiresAt,
          ipAddress: p.ipAddress,
          userAgent: p.userAgent,
          authMethod: p.authMethod,
          mfaVerified: p.mfaVerified,
        };
      })
      .sort(
        (a, b) => Number(b.current) - Number(a.current) || +b.lastActivityAt - +a.lastActivityAt,
      );
  }
}

@Injectable()
export class RevokeMySessionUseCase {
  constructor(@Inject(SESSION_STORE) private readonly sessions: SessionStore) {}

  async execute(principal: Principal, sessionId: string): Promise<void> {
    const session = await this.sessions.find(sessionId);
    // Never reveal other users' sessions: unknown and foreign look the same.
    if (session?.userId !== principal.userId) throw new NotFoundError('Session', sessionId);
    if (session.id === principal.sessionId) {
      throw new BusinessRuleError('Use sign out to end the current session.', 'CURRENT_SESSION');
    }
    await this.sessions.delete(sessionId);
  }
}

@Injectable()
export class RevokeOtherSessionsUseCase {
  constructor(@Inject(SESSION_STORE) private readonly sessions: SessionStore) {}

  async execute(principal: Principal): Promise<{ terminated: number }> {
    const sessions = await this.sessions.listForUser(principal.userId);
    const others = sessions.filter((s) => s.id !== principal.sessionId);
    await Promise.all(others.map((s) => this.sessions.delete(s.id)));
    return { terminated: others.length };
  }
}

// ── Password ─────────────────────────────────────────────────────────────────

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly revokeOthers: RevokeOtherSessionsUseCase,
    private readonly passwords: PasswordPolicyService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async execute(
    principal: Principal,
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ terminatedSessions: number }> {
    const user = await this.users.getById(principal.userId);
    if (!user.passwordHash) {
      throw new BusinessRuleError(
        'This account signs in through the identity provider; its password is managed there.',
        'EXTERNAL_ACCOUNT',
      );
    }
    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
      throw new AuthenticationError(ErrorCode.AUTH_INVALID_CREDENTIALS, {
        message: 'The current password is incorrect.',
      });
    }
    // Policy: composition, personal info, common passwords, history, minimum age.
    await this.passwords.assertAcceptable(input.newPassword, 'newPassword', user, user, {
      enforceMinAge: true,
    });
    const outgoing = user.passwordHash;
    user.replacePasswordHash(await this.hasher.hash(input.newPassword), principal.userId);
    const saved = await this.users.update(user);
    await this.passwords.remember(saved, outgoing);
    await this.events.publish<PasswordChangedEvent>({
      name: AppEvents.PasswordChanged,
      payload: { userId: user.id, via: 'self' },
    });
    // Other devices must sign in again with the new password.
    const { terminated } = await this.revokeOthers.execute(principal);
    return { terminatedSessions: terminated };
  }
}
