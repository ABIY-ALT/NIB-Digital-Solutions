import { Module } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { UsersModule } from '#modules/users/users.module.js';
import {
  ACCESS_TOKEN_SERVICE,
  AUTH_SETTINGS,
  IDENTITY_PROVIDERS,
  MFA_CHALLENGE_STORE,
  MFA_PROVIDERS,
  PASSWORD_CHANGE_STORE,
  PASSWORD_RESET_STORE,
  REFRESH_TOKEN_CODEC,
  type AuthSettings,
  type IdentityProvider,
  type MfaProvider,
} from './application/ports/auth.ports.js';
import { AuthenticationFlow } from './application/services/authentication-flow.service.js';
import { LocalPasswordIdentityProvider } from './application/services/local-password.identity-provider.js';
import { SessionIssuer } from './application/services/session-issuer.service.js';
import { CompletePasswordChangeUseCase } from './application/use-cases/complete-password-change.use-case.js';
import { ExchangeExternalTokenUseCase } from './application/use-cases/exchange-external-token.use-case.js';
import { GetSessionUseCase } from './application/use-cases/get-session.use-case.js';
import { LoginUseCase } from './application/use-cases/login.use-case.js';
import { LogoutUseCase } from './application/use-cases/logout.use-case.js';
import {
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from './application/use-cases/password-reset.use-cases.js';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case.js';
import { ValidateAccessTokenUseCase } from './application/use-cases/validate-access-token.use-case.js';
import { VerifyMfaUseCase } from './application/use-cases/verify-mfa.use-case.js';
import { JoseAccessTokenService } from './infrastructure/jose-access-token.service.js';
import { KeyValueMfaChallengeStore } from './infrastructure/kv-mfa-challenge.store.js';
import { KeyValuePasswordChangeStore } from './infrastructure/kv-password-change.store.js';
import { KeyValuePasswordResetStore } from './infrastructure/kv-password-reset.store.js';
import { ConsoleSmsGateway, SmsMfaProvider } from './infrastructure/mfa/sms.mfa-provider.js';
import { TotpMfaProvider } from './infrastructure/mfa/totp.mfa-provider.js';
import { OidcIdentityProvider } from './infrastructure/oidc.identity-provider.js';
import { OpaqueRefreshTokenCodec } from './infrastructure/refresh-token.codec.js';
import { AuthController } from './presentation/auth.controller.js';
import { AccountController } from './presentation/account.controller.js';
import {
  ChangePasswordUseCase,
  ListMySessionsUseCase,
  RevokeMySessionUseCase,
  RevokeOtherSessionsUseCase,
} from './application/use-cases/account.use-cases.js';
import {
  BeginTotpEnrollmentUseCase,
  ConfirmTotpEnrollmentUseCase,
  DisableMfaUseCase,
} from './application/use-cases/mfa-enrollment.use-cases.js';
import { MFA_ENROLLMENT } from './application/ports/mfa-enrollment.port.js';
import { KeyValueTotpEnrollmentService } from './infrastructure/mfa/kv-totp-enrollment.service.js';
import { JwtAuthGuard } from './presentation/jwt-auth.guard.js';

/**
 * Authentication. Every dependency is bound to a port, so the token format,
 * session store, identity providers and MFA methods can be swapped or extended
 * here without touching the use cases.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController, AccountController],
  providers: [
    {
      provide: AUTH_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): AuthSettings => ({
        accessTokenTtlSeconds: c.auth.accessTokenTtlSeconds,
        refreshTokenTtlSeconds: c.auth.refreshTokenTtlSeconds,
        refreshReuseGraceSeconds: c.auth.refreshReuseGraceSeconds,
        sessionIdleTimeoutSeconds: c.auth.sessionIdleTimeoutSeconds,
        maxFailedAttempts: c.auth.maxFailedAttempts,
        lockoutMinutes: c.auth.lockoutMinutes,
        mfaChallengeTtlSeconds: c.mfa.challengeTtlSeconds,
        mfaMaxAttempts: c.mfa.maxAttempts,
        passwordReset: { ...c.auth.passwordReset, publicUrl: c.app.publicUrl },
      }),
    },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JoseAccessTokenService },
    { provide: REFRESH_TOKEN_CODEC, useClass: OpaqueRefreshTokenCodec },
    { provide: MFA_CHALLENGE_STORE, useClass: KeyValueMfaChallengeStore },
    { provide: PASSWORD_CHANGE_STORE, useClass: KeyValuePasswordChangeStore },
    { provide: PASSWORD_RESET_STORE, useClass: KeyValuePasswordResetStore },

    // Identity providers (ordered). Add new providers to this list.
    LocalPasswordIdentityProvider,
    OidcIdentityProvider,
    {
      provide: IDENTITY_PROVIDERS,
      inject: [LocalPasswordIdentityProvider, OidcIdentityProvider],
      useFactory: (...providers: IdentityProvider[]) => providers,
    },

    // MFA providers. Add new second factors to this list.
    ConsoleSmsGateway,
    TotpMfaProvider,
    SmsMfaProvider,
    {
      provide: MFA_PROVIDERS,
      inject: [TotpMfaProvider, SmsMfaProvider],
      useFactory: (...providers: MfaProvider[]) => providers,
    },

    SessionIssuer,
    AuthenticationFlow,
    LoginUseCase,
    VerifyMfaUseCase,
    CompletePasswordChangeUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    ValidateAccessTokenUseCase,
    ExchangeExternalTokenUseCase,
    GetSessionUseCase,
    ListMySessionsUseCase,
    RevokeMySessionUseCase,
    RevokeOtherSessionsUseCase,
    ChangePasswordUseCase,
    { provide: MFA_ENROLLMENT, useClass: KeyValueTotpEnrollmentService },
    BeginTotpEnrollmentUseCase,
    ConfirmTotpEnrollmentUseCase,
    DisableMfaUseCase,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard, ValidateAccessTokenUseCase, TotpMfaProvider],
})
export class AuthModule {}
