import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import {
  ACCESS_TOKEN_SERVICE,
  AUTH_SETTINGS,
  SESSION_STORE,
  type AccessTokenService,
  type AuthSettings,
  type SessionStore,
} from '../ports/auth.ports.js';

/**
 * Validates a bearer token on every request:
 *   1. signature, issuer, audience, expiry (JWT)
 *   2. the session still exists (not logged out / revoked)
 *   3. the session is not idle beyond the timeout
 * and returns the Principal the rest of the request works with.
 */
@Injectable()
export class ValidateAccessTokenUseCase implements UseCase<string, Principal> {
  constructor(
    @Inject(ACCESS_TOKEN_SERVICE) private readonly tokens: AccessTokenService,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  async execute(token: string): Promise<Principal> {
    const claims = await this.tokens.verify(token);
    const session = await this.sessions.find(claims.sid);
    if (session?.userId !== claims.sub)
      throw new AuthenticationError(ErrorCode.AUTH_SESSION_REVOKED);

    const now = new Date();
    if (session.isExpired(now) || session.isIdle(now, this.settings.sessionIdleTimeoutSeconds)) {
      await this.sessions.delete(session.id);
      throw new AuthenticationError(ErrorCode.AUTH_SESSION_EXPIRED);
    }
    if (session.touch(now)) await this.sessions.save(session);

    return {
      userId: claims.sub,
      username: claims.username,
      sessionId: claims.sid,
      roles: claims.roles,
      permissions: claims.permissions,
      attributes: claims.attributes,
      mfaVerified: claims.mfa,
      authMethod: claims.amr,
    };
  }
}
