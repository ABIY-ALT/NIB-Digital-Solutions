import { Inject, Injectable, Logger } from '@nestjs/common';
import type { UseCase } from '#core/application/use-case.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import type { AuthTokens } from '../auth.results.js';
import {
  AUTH_SETTINGS,
  REFRESH_TOKEN_CODEC,
  SESSION_STORE,
  type AuthSettings,
  type RefreshTokenCodec,
  type SessionStore,
} from '../ports/auth.ports.js';
import { SessionIssuer } from '../services/session-issuer.service.js';

export interface RefreshSessionInput {
  refreshToken: string;
}

/**
 * Refresh-token rotation with reuse detection.
 *   • current token                → rotate, new pair
 *   • previous token within grace  → rotate again (absorbs concurrent BFF refreshes)
 *   • anything else                → treated as stolen: session revoked
 * Roles/permissions are re-read so changes take effect at the next refresh.
 */
@Injectable()
export class RefreshSessionUseCase implements UseCase<RefreshSessionInput, AuthTokens> {
  private readonly logger = new Logger(RefreshSessionUseCase.name);

  constructor(
    @Inject(REFRESH_TOKEN_CODEC) private readonly codec: RefreshTokenCodec,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    private readonly issuer: SessionIssuer,
  ) {}

  async execute({ refreshToken }: RefreshSessionInput): Promise<AuthTokens> {
    const parsed = this.codec.parse(refreshToken);
    if (!parsed) throw new AuthenticationError(ErrorCode.AUTH_REFRESH_TOKEN_INVALID);

    const session = await this.sessions.find(parsed.sessionId);
    const now = new Date();
    if (!session) throw new AuthenticationError(ErrorCode.AUTH_REFRESH_TOKEN_INVALID);
    if (session.isExpired(now) || session.isIdle(now, this.settings.sessionIdleTimeoutSeconds)) {
      await this.sessions.delete(session.id);
      throw new AuthenticationError(ErrorCode.AUTH_SESSION_EXPIRED);
    }

    const match = session.matchRefreshToken(
      parsed.hash,
      now,
      this.settings.refreshReuseGraceSeconds,
    );
    if (match === 'reused') {
      this.logger.warn(
        { sessionId: session.id, userId: session.userId },
        'Refresh token reuse detected; revoking session',
      );
      await this.sessions.delete(session.id);
      throw new AuthenticationError(ErrorCode.AUTH_REFRESH_TOKEN_REUSED);
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.loginBlock(now)) {
      await this.sessions.delete(session.id);
      throw new AuthenticationError(ErrorCode.AUTH_SESSION_REVOKED);
    }
    return this.issuer.rotate(user, session);
  }
}
