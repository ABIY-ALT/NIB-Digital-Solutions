import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Principal } from '#core/application/security/principal.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit, Public } from '#core/presentation/decorators/metadata.decorators.js';
import { AuthRateLimit } from '#core/presentation/decorators/rate-limit.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import { AuthenticatedOnly } from '#modules/authorization/presentation/authorization.decorators.js';
import { GetCurrentUserUseCase } from '#modules/users/application/get-current-user.use-case.js';
import { SECURITY_POLICY } from '#modules/users/application/password-policy.service.js';
import type { SecurityPolicy } from '#modules/users/domain/password-policy.js';
import {
  userResponseMapper,
  UserProfileDtoSchema,
  type UserProfileDto,
} from '#modules/users/presentation/user.response-mapper.js';
import type { ClientInfo } from '../application/auth.results.js';
import { CompletePasswordChangeUseCase } from '../application/use-cases/complete-password-change.use-case.js';
import { ExchangeExternalTokenUseCase } from '../application/use-cases/exchange-external-token.use-case.js';
import { GetSessionUseCase } from '../application/use-cases/get-session.use-case.js';
import { LoginUseCase } from '../application/use-cases/login.use-case.js';
import { LogoutUseCase } from '../application/use-cases/logout.use-case.js';
import {
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from '../application/use-cases/password-reset.use-cases.js';
import { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case.js';
import { VerifyMfaUseCase } from '../application/use-cases/verify-mfa.use-case.js';
import {
  toAuthOutcomeDto,
  toTokensDto,
  type AuthOutcomeDto,
  type TokensDto,
} from './auth.response.js';
import { PasswordPolicyDto, toPasswordPolicyDto } from './password-policy.response.js';
import {
  CompletePasswordChangeSchema,
  ExchangeSchema,
  ForgotPasswordSchema,
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  ResetPasswordSchema,
  VerifyMfaSchema,
  type CompletePasswordChangeBody,
  type ExchangeBody,
  type ForgotPasswordBody,
  type LoginBody,
  type LogoutBody,
  type RefreshBody,
  type ResetPasswordBody,
  type VerifyMfaBody,
} from './auth.schemas.js';

const client = (): ClientInfo => {
  const ctx = RequestContext.get();
  return { ipAddress: ctx?.ipAddress ?? null, userAgent: ctx?.userAgent ?? null };
};

/**
 * Authentication endpoints. Called ONLY by the BFF (service signature required);
 * the tokens returned here never reach the browser.
 */
@ApiTags('Auth')
@ApiStandardErrors()
@Controller({ path: 'auth', version: '1' })
export class AuthController extends BaseController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly verifyMfaUseCase: VerifyMfaUseCase,
    private readonly refreshUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly exchangeUseCase: ExchangeExternalTokenUseCase,
    private readonly sessionUseCase: GetSessionUseCase,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly completePasswordChange: CompletePasswordChangeUseCase,
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    @Inject(SECURITY_POLICY) private readonly policy: SecurityPolicy,
  ) {
    super();
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'AUTH_LOGIN',
    category: 'AUTHENTICATION',
    resourceType: 'Session',
    actorHint: (req) => (req.body as { username?: string } | undefined)?.username,
    resourceId: (_req, data) =>
      (data as AuthOutcomeDto | undefined)?.status === 'AUTHENTICATED'
        ? (data as Extract<AuthOutcomeDto, { status: 'AUTHENTICATED' }>).tokens.sessionId
        : null,
    metadata: (_req, data) => ({ result: (data as AuthOutcomeDto | undefined)?.status }),
  })
  @ApiOperation({ summary: 'Credential login → tokens or MFA challenge' })
  @ApiZodBody(LoginSchema)
  @ApiEnvelope(200, 'AUTHENTICATED (tokens + profile) or MFA_REQUIRED (challenge)')
  async login(@Body(zod(LoginSchema)) body: LoginBody): Promise<ApiResult<AuthOutcomeDto>> {
    return this.ok(
      toAuthOutcomeDto(await this.loginUseCase.execute({ ...body, ...client() }), this.policy),
    );
  }

  @Post('mfa/verify')
  @Public()
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'AUTH_MFA_VERIFY',
    category: 'AUTHENTICATION',
    resourceType: 'MfaChallenge',
    resourceId: (req) => (req.body as { challengeId?: string }).challengeId,
  })
  @ApiOperation({ summary: 'Complete an MFA challenge (TOTP / SMS)' })
  @ApiZodBody(VerifyMfaSchema)
  @ApiEnvelope(200, 'AUTHENTICATED')
  async verifyMfa(
    @Body(zod(VerifyMfaSchema)) body: VerifyMfaBody,
  ): Promise<ApiResult<AuthOutcomeDto>> {
    return this.ok(
      toAuthOutcomeDto(await this.verifyMfaUseCase.execute({ ...body, ...client() }), this.policy),
    );
  }

  @Post('password/change')
  @Public()
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'AUTH_PASSWORD_CHANGE_REQUIRED',
    category: 'AUTHENTICATION',
    resourceType: 'User',
    resourceId: (_req, data) =>
      (data as AuthOutcomeDto | undefined)?.status === 'AUTHENTICATED'
        ? (data as Extract<AuthOutcomeDto, { status: 'AUTHENTICATED' }>).user.id
        : null,
  })
  @ApiOperation({
    summary: 'Set a new password when sign-in requires it (expired or temporary password)',
  })
  @ApiZodBody(CompletePasswordChangeSchema)
  @ApiEnvelope(200, 'AUTHENTICATED')
  async changeRequiredPassword(
    @Body(zod(CompletePasswordChangeSchema)) body: CompletePasswordChangeBody,
  ): Promise<ApiResult<AuthOutcomeDto>> {
    return this.ok(
      toAuthOutcomeDto(
        await this.completePasswordChange.execute({ ...body, ...client() }),
        this.policy,
      ),
    );
  }

  @Post('password/forgot')
  @Public()
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'AUTH_PASSWORD_RESET_REQUEST',
    category: 'AUTHENTICATION',
    resourceType: 'User',
    resourceId: () => null,
    actorHint: (req) => (req.body as { identifier?: string } | undefined)?.identifier,
  })
  @ApiOperation({
    summary: 'E-mail a password reset link (same answer whether or not the account exists)',
  })
  @ApiZodBody(ForgotPasswordSchema)
  @ApiEnvelope(200, 'Accepted')
  async forgotPassword(
    @Body(zod(ForgotPasswordSchema)) body: ForgotPasswordBody,
  ): Promise<ApiResult<null>> {
    await this.requestPasswordReset.execute(body);
    return this.empty('If the account exists, a reset link was sent to its e-mail address.');
  }

  @Post('password/reset')
  @Public()
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'AUTH_PASSWORD_RESET',
    category: 'AUTHENTICATION',
    resourceType: 'User',
    resourceId: (_req, data) => (data as { userId?: string } | undefined)?.userId,
  })
  @ApiOperation({ summary: 'Set a new password with an e-mailed reset link' })
  @ApiZodBody(ResetPasswordSchema)
  @ApiEnvelope(200, 'Password changed')
  async resetPassword(
    @Body(zod(ResetPasswordSchema)) body: ResetPasswordBody,
  ): Promise<ApiResult<{ userId: string }>> {
    return this.ok(
      await this.resetPasswordUseCase.execute(body),
      'Your password was changed. Sign in with the new password.',
    );
  }

  @Get('password-policy')
  @Public()
  @ApiOperation({ summary: 'Password rules (drives the live checklist in password forms)' })
  @ApiEnvelope(200, 'Password policy', PasswordPolicyDto)
  passwordPolicy(): ApiResult<PasswordPolicyDto> {
    return this.ok(toPasswordPolicyDto(this.policy));
  }

  @Post('token/refresh')
  @Public()
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'AUTH_TOKEN_REFRESH',
    category: 'AUTHENTICATION',
    resourceType: 'Session',
    resourceId: (_req, data) => (data as TokensDto | undefined)?.sessionId,
  })
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiZodBody(RefreshSchema)
  @ApiEnvelope(200, 'New token pair')
  async refresh(@Body(zod(RefreshSchema)) body: RefreshBody): Promise<ApiResult<TokensDto>> {
    return this.ok(toTokensDto(await this.refreshUseCase.execute(body)));
  }

  @Post('token/exchange')
  @Public()
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'AUTH_EXTERNAL_EXCHANGE',
    category: 'AUTHENTICATION',
    resourceType: 'Session',
    metadata: (req) => ({ provider: (req.body as { provider?: string }).provider }),
  })
  @ApiOperation({ summary: 'Exchange an external OIDC ID token for an AppCore session' })
  @ApiZodBody(ExchangeSchema)
  @ApiEnvelope(200, 'AUTHENTICATED or MFA_REQUIRED')
  async exchange(
    @Body(zod(ExchangeSchema)) body: ExchangeBody,
  ): Promise<ApiResult<AuthOutcomeDto>> {
    return this.ok(
      toAuthOutcomeDto(await this.exchangeUseCase.execute({ ...body, ...client() }), this.policy),
    );
  }

  @Post('logout')
  @HttpCode(200)
  @AuthenticatedOnly()
  @ApiAuth()
  @Audit({
    action: 'AUTH_LOGOUT',
    category: 'AUTHENTICATION',
    resourceType: 'Session',
    resourceId: (req) => req.principal?.sessionId,
  })
  @ApiOperation({ summary: 'End the current session (or all sessions)' })
  @ApiZodBody(LogoutSchema)
  @ApiEnvelope(200, 'Logged out')
  async logout(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(LogoutSchema)) body: LogoutBody,
  ): Promise<ApiResult<{ terminated: number }>> {
    return this.ok(
      await this.logoutUseCase.execute({ principal, allSessions: body.allSessions }),
      'Signed out.',
    );
  }

  @Get('session')
  @AuthenticatedOnly()
  @ApiAuth()
  @ApiOperation({ summary: 'Validate and describe the current session' })
  @ApiEnvelope(200, 'Session info')
  async session(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<Record<string, unknown>>> {
    const s = await this.sessionUseCase.execute(principal);
    return this.ok({
      ...s,
      createdAt: s.createdAt.toISOString(),
      lastActivityAt: s.lastActivityAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      idleExpiresAt: s.idleExpiresAt.toISOString(),
    });
  }

  @Get('me')
  @AuthenticatedOnly()
  @ApiAuth()
  @ApiOperation({ summary: 'Current user with roles and effective permissions' })
  @ApiEnvelope(200, 'Profile', UserProfileDtoSchema)
  async me(@CurrentPrincipal() principal: Principal): Promise<ApiResult<UserProfileDto>> {
    return this.ok(
      userResponseMapper.toProfile(await this.currentUser.execute(principal), this.policy),
    );
  }
}
