import { Inject, Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { ExternalApiClientFactory } from '#core/infrastructure/external-api/external-api.factory.js';
import { User } from '#modules/users/domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import type {
  IdentityProvider,
  IdentityRequest,
  VerifiedIdentity,
} from '../application/ports/auth.ports.js';

/**
 * Generic OpenID Connect identity provider. Works with any compliant IdP:
 * discovery document → JWKS → verify ID token (issuer, audience, signature, expiry).
 *
 * Account linking: by (provider, sub), then by verified email (then linked),
 * then optional auto-provisioning with the USER role.
 */
@Injectable()
export class OidcIdentityProvider implements IdentityProvider {
  readonly id: string;
  private readonly logger = new Logger(OidcIdentityProvider.name);
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly clients: ExternalApiClientFactory,
  ) {
    this.id = config.oidc.providerName;
  }

  supports(request: IdentityRequest): boolean {
    return this.config.oidc.enabled && request.type === 'external' && request.provider === this.id;
  }

  async authenticate(request: IdentityRequest): Promise<VerifiedIdentity> {
    if (request.type !== 'external')
      throw new AuthenticationError(ErrorCode.AUTH_PROVIDER_UNAVAILABLE);
    const claims = await this.verifyToken(request.token);
    let user = await this.resolveUser(claims);
    if (!user) throw new AuthenticationError(ErrorCode.AUTH_EXTERNAL_IDENTITY_UNLINKED);

    const block = user.loginBlock(new Date());
    if (block === 'DISABLED') throw new AuthenticationError(ErrorCode.AUTH_ACCOUNT_DISABLED);
    if (block === 'LOCKED') throw new AuthenticationError(ErrorCode.AUTH_ACCOUNT_LOCKED);

    user.registerSuccessfulLogin(new Date());
    user = await this.users.update(user);
    const amr = Array.isArray(claims['amr']) ? (claims['amr'] as string[]) : [];
    return {
      user,
      method: 'external',
      provider: this.id,
      mfaSatisfied: amr.includes('mfa') || amr.includes('otp'),
    };
  }

  /** The linked account, else the account with the verified e-mail (linked now), else a new one. */
  private async resolveUser(claims: JWTPayload): Promise<User | null> {
    const subject = claims.sub!;
    const email = typeof claims['email'] === 'string' ? claims['email'].toLowerCase() : null;

    const linked = await this.users.findByExternalIdentity(this.id, subject);
    if (linked) return linked;
    if (email && claims['email_verified'] === true) {
      const user = await this.users.findByEmail(email);
      if (user) {
        user.linkExternalIdentity(this.id, subject, user.id);
        return this.users.update(user);
      }
    }
    if (this.config.oidc.autoProvision && email) return this.provision(claims, subject, email);
    return null;
  }

  private async provision(claims: JWTPayload, subject: string, email: string): Promise<User> {
    const preferred =
      typeof claims['preferred_username'] === 'string'
        ? claims['preferred_username']
        : email.split('@')[0]!;
    const username = preferred.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const fullName = typeof claims['name'] === 'string' ? claims['name'] : username;
    const created = User.create(
      { username, email, fullName, passwordHash: null, roleCodes: ['USER'] },
      null,
    );
    created.linkExternalIdentity(this.id, subject, null);
    return this.users.save(created);
  }

  private async verifyToken(token: string): Promise<JWTPayload> {
    const { issuer, audience } = this.config.oidc;
    try {
      const jwks = await this.getJwks();
      const { payload } = await jwtVerify(token, jwks, { issuer, audience, clockTolerance: 30 });
      if (!payload.sub) throw new Error('missing sub');
      return payload;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      this.logger.warn({ err: error }, 'External token rejected');
      throw new AuthenticationError(ErrorCode.AUTH_EXTERNAL_TOKEN_INVALID);
    }
  }

  /** Discovers jwks_uri through the centralized external API client (timeouts, retries, breaker). */
  private async getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (this.jwks) return this.jwks;
    const { issuer, jwksUri } = this.config.oidc;
    let uri = jwksUri;
    if (!uri) {
      const client = this.clients.create({
        name: `oidc:${this.id}`,
        baseUrl: issuer!,
        timeoutMs: 5_000,
      });
      try {
        const res = await client.request<{ jwks_uri: string }>({
          method: 'GET',
          path: '.well-known/openid-configuration',
        });
        uri = res.data.jwks_uri;
      } catch (error) {
        throw new AuthenticationError(ErrorCode.AUTH_PROVIDER_UNAVAILABLE, { cause: error });
      }
    }
    this.jwks = createRemoteJWKSet(new URL(uri), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
    });
    return this.jwks;
  }
}
