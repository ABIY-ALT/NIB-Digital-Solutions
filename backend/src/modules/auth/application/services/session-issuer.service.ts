import { Inject, Injectable } from '@nestjs/common';
import { AppEvents, type SessionEvictedEvent } from '#core/application/events/app-events.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import { SECURITY_POLICY } from '#modules/users/application/password-policy.service.js';
import type { SecurityPolicy } from '#modules/users/domain/password-policy.js';
import type { User } from '#modules/users/domain/user.entity.js';
import { AuthSession, type AuthMethod } from '#modules/auth/domain/auth-session.js';
import type { AuthTokens, ClientInfo } from '../auth.results.js';
import {
  ACCESS_TOKEN_SERVICE,
  AUTH_SETTINGS,
  REFRESH_TOKEN_CODEC,
  SESSION_STORE,
  type AccessTokenClaims,
  type AccessTokenService,
  type AuthSettings,
  type RefreshTokenCodec,
  type SessionStore,
} from '../ports/auth.ports.js';

/** Creates sessions and issues token pairs for authenticated users. */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(REFRESH_TOKEN_CODEC) private readonly refreshTokens: RefreshTokenCodec,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    @Inject(SECURITY_POLICY) private readonly policy: SecurityPolicy,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async startSession(
    user: User,
    method: AuthMethod,
    provider: string,
    mfaVerified: boolean,
    client: ClientInfo,
  ): Promise<AuthTokens> {
    await this.enforceConcurrentLimit(user.id);
    const now = new Date();
    const sessionId = globalThis.crypto.randomUUID();
    const refresh = this.refreshTokens.generate(sessionId);
    const session = AuthSession.start(
      {
        id: sessionId,
        userId: user.id,
        username: user.username,
        refreshTokenHash: refresh.hash,
        expiresAt: new Date(now.getTime() + this.settings.refreshTokenTtlSeconds * 1000),
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        mfaVerified,
        authMethod: method,
        provider,
      },
      now,
    );
    await this.sessions.save(session);
    const access = await this.accessTokens.issue(this.claimsFor(user, session));
    return this.tokens(access.token, access.expiresAt, refresh.token, session);
  }

  /** Rotates the refresh token and issues a fresh access token with current roles. */
  async rotate(user: User, session: AuthSession): Promise<AuthTokens> {
    const refresh = this.refreshTokens.generate(session.id);
    session.rotate(refresh.hash, new Date());
    await this.sessions.save(session);
    const access = await this.accessTokens.issue(this.claimsFor(user, session));
    return this.tokens(access.token, access.expiresAt, refresh.token, session);
  }

  /**
   * Concurrent-session policy: when a new session would exceed the limit, the
   * least recently used sessions end (the user is told why).
   */
  private async enforceConcurrentLimit(userId: string): Promise<void> {
    const limit = this.policy.session.maxConcurrent;
    if (limit <= 0) return;
    const existing = await this.sessions.listForUser(userId);
    const excess = existing.length - (limit - 1);
    if (excess <= 0) return;
    const oldest = [...existing]
      .sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime())
      .slice(0, excess);
    await Promise.all(oldest.map((s) => this.sessions.delete(s.id)));
    await this.events.publish<SessionEvictedEvent>({
      name: AppEvents.SessionEvicted,
      payload: { userId, ended: oldest.length, limit },
      actorId: userId,
    });
  }

  claimsFor(user: User, session: AuthSession): AccessTokenClaims {
    return {
      sub: user.id,
      sid: session.id,
      username: user.username,
      roles: [...user.roleCodes],
      permissions: user.permissions,
      attributes: user.attributes,
      mfa: session.mfaVerified,
      amr: session.authMethod,
    };
  }

  private tokens(
    accessToken: string,
    accessExp: Date,
    refreshToken: string,
    session: AuthSession,
  ): AuthTokens {
    return {
      tokenType: 'Bearer',
      accessToken,
      accessTokenExpiresAt: accessExp,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
      sessionId: session.id,
      idleTimeoutSeconds: this.settings.sessionIdleTimeoutSeconds,
    };
  }
}
