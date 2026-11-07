import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppEvents,
  type MfaRequiredEvent,
  type NewSignInEvent,
} from '#core/application/events/app-events.js';
import { CACHE_PORT, type CachePort } from '#core/application/ports/cache.port.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { SECURITY_POLICY } from '#modules/users/application/password-policy.service.js';
import type { SecurityPolicy } from '#modules/users/domain/password-policy.js';
import type { User } from '#modules/users/domain/user.entity.js';
import type { AuthMethod } from '#modules/auth/domain/auth-session.js';
import type { AuthenticationOutcome, ClientInfo } from '../auth.results.js';
import {
  AUTH_SETTINGS,
  IDENTITY_PROVIDERS,
  MFA_CHALLENGE_STORE,
  MFA_PROVIDERS,
  PASSWORD_CHANGE_STORE,
  type AuthSettings,
  type IdentityProvider,
  type IdentityRequest,
  type MfaChallengeStore,
  type MfaProvider,
  type PasswordChangeChallengeStore,
  type VerifiedIdentity,
} from '../ports/auth.ports.js';
import { SessionIssuer } from './session-issuer.service.js';

const PASSWORD_CHANGE_TTL_SECONDS = 600;
const KNOWN_DEVICE_TTL_SECONDS = 90 * 86_400;

/**
 * Shared authentication pipeline used by credential login, MFA verification,
 * external-token exchange and the forced password change:
 *
 *   identity provider → MFA challenge? → password change required? → session
 *                                                                    → sign-in alerts
 */
@Injectable()
export class AuthenticationFlow {
  private readonly logger = new Logger('AuthenticationFlow');

  constructor(
    @Inject(IDENTITY_PROVIDERS) private readonly providers: IdentityProvider[],
    @Inject(MFA_PROVIDERS) private readonly mfaProviders: MfaProvider[],
    @Inject(MFA_CHALLENGE_STORE) private readonly challenges: MfaChallengeStore,
    @Inject(PASSWORD_CHANGE_STORE) private readonly passwordChanges: PasswordChangeChallengeStore,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    @Inject(SECURITY_POLICY) private readonly policy: SecurityPolicy,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
    private readonly issuer: SessionIssuer,
  ) {}

  async authenticate(request: IdentityRequest, client: ClientInfo): Promise<AuthenticationOutcome> {
    const provider = this.providers.find((p) => p.supports(request));
    if (!provider) throw new AuthenticationError(ErrorCode.AUTH_PROVIDER_UNAVAILABLE);
    const identity = await provider.authenticate(request);
    return this.complete(identity, client);
  }

  async complete(identity: VerifiedIdentity, client: ClientInfo): Promise<AuthenticationOutcome> {
    const { user } = identity;
    if (user.mfaEnabled && !identity.mfaSatisfied) {
      const method = user.mfaMethod ?? 'TOTP';
      const mfa = this.mfaProviders.find((p) => p.method === method);
      if (!mfa) throw new AuthenticationError(ErrorCode.AUTH_MFA_METHOD_UNSUPPORTED);

      const challengeId = globalThis.crypto.randomUUID();
      const expiresAt = new Date(Date.now() + this.settings.mfaChallengeTtlSeconds * 1000);
      const initiation = await mfa.initiate(user, challengeId);
      await this.challenges.create(
        {
          id: challengeId,
          userId: user.id,
          method,
          attempts: 0,
          authMethod: identity.method,
          provider: identity.provider,
          expiresAt: expiresAt.toISOString(),
          state: initiation.state,
        },
        this.settings.mfaChallengeTtlSeconds,
      );
      return {
        status: 'MFA_REQUIRED',
        challengeId,
        method,
        expiresAt,
        deliveryHint: initiation.deliveryHint,
      };
    }
    return this.finish(user, identity.method, identity.provider, identity.mfaSatisfied, client);
  }

  /**
   * After every factor is verified: an expired or temporary password must be
   * replaced before a session exists (the session is issued by
   * CompletePasswordChangeUseCase once it is).
   */
  async finish(
    user: User,
    method: AuthMethod,
    provider: string,
    mfaVerified: boolean,
    client: ClientInfo,
  ): Promise<AuthenticationOutcome> {
    const reason = user.passwordChangeReason(this.policy.password.maxAgeDays, new Date());
    if (reason) {
      const expiresAt = new Date(Date.now() + PASSWORD_CHANGE_TTL_SECONDS * 1000);
      const changeToken = randomUUID();
      await this.passwordChanges.create(
        {
          id: changeToken,
          userId: user.id,
          reason,
          authMethod: method,
          provider,
          mfaVerified,
          expiresAt: expiresAt.toISOString(),
        },
        PASSWORD_CHANGE_TTL_SECONDS,
      );
      return { status: 'PASSWORD_CHANGE_REQUIRED', changeToken, reason, expiresAt };
    }
    return this.startSession(user, method, provider, mfaVerified, client);
  }

  async startSession(
    user: User,
    method: AuthMethod,
    provider: string,
    mfaVerified: boolean,
    client: ClientInfo,
  ): Promise<AuthenticationOutcome> {
    const tokens = await this.issuer.startSession(user, method, provider, mfaVerified, client);
    await this.signInAlerts(user, client).catch((error: unknown) =>
      this.logger.warn({ err: error, userId: user.id }, 'Sign-in alerts failed'),
    );
    return { status: 'AUTHENTICATED', tokens, user };
  }

  /** New device/network alert and the "two-step verification required" reminder. */
  private async signInAlerts(user: User, client: ClientInfo): Promise<void> {
    if (this.policy.session.newDeviceAlerts) {
      const fingerprint = deviceFingerprint(client);
      const deviceKey = `known-device:${user.id}:${fingerprint}`;
      const anyKey = `known-device:${user.id}:any`;
      const [known, hasHistory] = await Promise.all([
        this.cache.get<boolean>(deviceKey),
        this.cache.get<boolean>(anyKey),
      ]);
      await this.cache.set(deviceKey, true, KNOWN_DEVICE_TTL_SECONDS);
      await this.cache.set(anyKey, true, KNOWN_DEVICE_TTL_SECONDS);
      // The very first tracked sign-in establishes the baseline: no alert.
      if (!known && hasHistory) {
        await this.events.publish<NewSignInEvent>({
          name: AppEvents.NewSignIn,
          payload: {
            userId: user.id,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            at: new Date().toISOString(),
          },
          actorId: user.id,
        });
      }
    }

    const required = this.policy.mfa.requiredRoles;
    const missing = user.roleCodes.filter((r) => required.includes(r));
    if (!user.mfaEnabled && missing.length) {
      const key = `mfa-required-reminder:${user.id}:${new Date().toISOString().slice(0, 10)}`;
      if (!(await this.cache.get(key))) {
        await this.cache.set(key, true, 86_400);
        await this.events.publish<MfaRequiredEvent>({
          name: AppEvents.MfaRequired,
          payload: { userId: user.id, roles: missing },
          actorId: user.id,
        });
      }
    }
  }
}

type FamilyRules = ReadonlyArray<readonly [pattern: RegExp, family: string]>;

/** First match wins: Edge's user agent also names Chrome and Safari, Chrome's names Safari. */
const BROWSERS: FamilyRules = [
  [/Edg\//, 'edge'],
  [/Chrome\//, 'chrome'],
  [/Firefox\//, 'firefox'],
  [/Safari\//, 'safari'],
];
const SYSTEMS: FamilyRules = [
  [/Windows/, 'windows'],
  [/Android/, 'android'],
  [/iPhone|iPad/, 'ios'],
  [/Mac OS/, 'macos'],
  [/Linux/, 'linux'],
];

const familyOf = (userAgent: string, rules: FamilyRules): string =>
  rules.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'other';

/** Browser/OS family + network (/24 IPv4, /48 IPv6): stable across DHCP renewals. */
function deviceFingerprint(client: ClientInfo): string {
  const ua = client.userAgent ?? '';
  const browser = familyOf(ua, BROWSERS);
  const os = familyOf(ua, SYSTEMS);
  const ip = client.ipAddress ?? '';
  const network = ip.includes(':')
    ? ip.split(':').slice(0, 3).join(':')
    : ip.split('.').slice(0, 3).join('.');
  return createHash('sha256').update(`${browser}|${os}|${network}`).digest('hex').slice(0, 32);
}
