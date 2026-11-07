import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import type {
  AccessTokenClaims,
  AccessTokenService,
  IssuedToken,
} from '../application/ports/auth.ports.js';

const ALG = 'HS256';

/**
 * Standards-based JWT access tokens (RFC 7519) signed with HS256 by the backend.
 * Only the backend verifies them; the BFF treats them as opaque and never sends
 * them to the browser.
 */
@Injectable()
export class JoseAccessTokenService implements AccessTokenService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async issue(claims: AccessTokenClaims): Promise<IssuedToken> {
    const { auth } = this.config;
    const expiresAt = new Date(Date.now() + auth.accessTokenTtlSeconds * 1000);
    const token = await new SignJWT({
      sid: claims.sid,
      usr: claims.username,
      roles: claims.roles,
      perms: claims.permissions,
      attrs: claims.attributes,
      mfa: claims.mfa,
      amr: [claims.amr],
    })
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(auth.issuer)
      .setAudience(auth.audience)
      .setIssuedAt()
      .setNotBefore('0s')
      .setJti(globalThis.crypto.randomUUID())
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(auth.accessTokenSecret);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { auth } = this.config;
    try {
      const { payload } = await jwtVerify(token, auth.accessTokenSecret, {
        algorithms: [ALG],
        issuer: auth.issuer,
        audience: auth.audience,
        clockTolerance: 5,
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
      });
      const amrClaim: unknown = payload['amr'];
      const amr = Array.isArray(amrClaim) ? (amrClaim as unknown[])[0] : undefined;
      const str = (v: unknown): string => (typeof v === 'string' ? v : '');
      return {
        sub: payload.sub!,
        sid: str(payload['sid']),
        username: str(payload['usr']),
        roles: (payload['roles'] as string[] | undefined) ?? [],
        permissions: (payload['perms'] as string[] | undefined) ?? [],
        attributes: (payload['attrs'] as Record<string, string | null> | undefined) ?? {},
        mfa: payload['mfa'] === true,
        amr: amr === 'external' ? 'external' : 'password',
      };
    } catch (error) {
      if (error instanceof errors.JWTExpired)
        throw new AuthenticationError(ErrorCode.AUTH_TOKEN_EXPIRED);
      throw new AuthenticationError(ErrorCode.AUTH_TOKEN_INVALID, { cause: error });
    }
  }
}
