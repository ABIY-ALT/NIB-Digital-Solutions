import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Principal } from '#core/application/security/principal.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit } from '#core/presentation/decorators/metadata.decorators.js';
import { AuthRateLimit } from '#core/presentation/decorators/rate-limit.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import { AuthenticatedOnly } from '#modules/authorization/presentation/authorization.decorators.js';
import { PASSWORD_POLICY } from '#modules/users/presentation/user.schemas.js';
import {
  ChangePasswordUseCase,
  ListMySessionsUseCase,
  RevokeMySessionUseCase,
  RevokeOtherSessionsUseCase,
} from '../application/use-cases/account.use-cases.js';
import {
  BeginTotpEnrollmentUseCase,
  ConfirmTotpEnrollmentUseCase,
  DisableMfaUseCase,
} from '../application/use-cases/mfa-enrollment.use-cases.js';

const ChangePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(256),
  newPassword: PASSWORD_POLICY,
});
const CodeSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});
const PasswordSchema = z.strictObject({ password: z.string().min(1).max(256) });
const SessionIdSchema = z.uuid();

/**
 * Self-service account endpoints for the signed-in user
 * (sessions, password, authenticator app).
 */
@ApiTags('Account')
@ApiAuth()
@ApiStandardErrors()
@AuthenticatedOnly()
@Controller({ path: 'account', version: '1' })
export class AccountController extends BaseController {
  constructor(
    private readonly listSessions: ListMySessionsUseCase,
    private readonly revokeSession: RevokeMySessionUseCase,
    private readonly revokeOthers: RevokeOtherSessionsUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly beginTotp: BeginTotpEnrollmentUseCase,
    private readonly confirmTotp: ConfirmTotpEnrollmentUseCase,
    private readonly disableMfaUseCase: DisableMfaUseCase,
  ) {
    super();
  }

  @Get('sessions')
  @ApiOperation({ summary: 'My active sessions (devices)' })
  @ApiEnvelope(200, 'Sessions')
  async sessions(@CurrentPrincipal() principal: Principal): Promise<ApiResult<unknown[]>> {
    const sessions = await this.listSessions.execute(principal);
    return this.ok(
      sessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        lastActivityAt: s.lastActivityAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    );
  }

  @Delete('sessions/:id')
  @Audit({ action: 'SESSION_REVOKE', category: 'SECURITY', resourceType: 'Session' })
  @ApiOperation({ summary: 'Sign out one of my other sessions' })
  @ApiEnvelope(200, 'Revoked')
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(SessionIdSchema)) id: string,
  ): Promise<ApiResult<null>> {
    await this.revokeSession.execute(principal, id);
    return this.empty('Session ended.');
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  @Audit({ action: 'SESSION_REVOKE_OTHERS', category: 'SECURITY', resourceType: 'Session' })
  @ApiOperation({ summary: 'Sign out everywhere else' })
  @ApiEnvelope(200, 'Revoked')
  async revokeAllOthers(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<{ terminated: number }>> {
    return this.ok(await this.revokeOthers.execute(principal), 'Other sessions ended.');
  }

  @Post('password')
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'PASSWORD_CHANGE',
    category: 'SECURITY',
    resourceType: 'User',
    resourceId: (req) => req.principal?.userId,
  })
  @ApiOperation({ summary: 'Change my password (ends my other sessions)' })
  @ApiZodBody(ChangePasswordSchema)
  @ApiEnvelope(200, 'Changed')
  async changePassword(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(ChangePasswordSchema)) body: z.infer<typeof ChangePasswordSchema>,
  ): Promise<ApiResult<{ terminatedSessions: number }>> {
    return this.ok(await this.changePasswordUseCase.execute(principal, body), 'Password changed.');
  }

  @Post('mfa/totp/setup')
  @HttpCode(200)
  @Audit({
    action: 'MFA_ENROLL_BEGIN',
    category: 'SECURITY',
    resourceType: 'User',
    resourceId: (req) => req.principal?.userId,
  })
  @ApiOperation({ summary: 'Start authenticator-app enrolment (returns secret + otpauth URI)' })
  @ApiEnvelope(200, 'Enrolment started')
  async beginTotpSetup(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<{ secret: string; otpauthUri: string; expiresAt: string }>> {
    const e = await this.beginTotp.execute(principal);
    return this.ok({
      secret: e.secret,
      otpauthUri: e.otpauthUri,
      expiresAt: e.expiresAt.toISOString(),
    });
  }

  @Post('mfa/totp/confirm')
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'MFA_ENROLL_CONFIRM',
    category: 'SECURITY',
    resourceType: 'User',
    resourceId: (req) => req.principal?.userId,
  })
  @ApiOperation({ summary: 'Confirm authenticator-app enrolment with a code' })
  @ApiZodBody(CodeSchema)
  @ApiEnvelope(200, 'Enabled')
  async confirmTotpSetup(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CodeSchema)) body: z.infer<typeof CodeSchema>,
  ): Promise<ApiResult<null>> {
    await this.confirmTotp.execute(principal, body.code);
    return this.empty('Two-step verification enabled.');
  }

  @Post('mfa/disable')
  @HttpCode(200)
  @AuthRateLimit()
  @Audit({
    action: 'MFA_DISABLE',
    category: 'SECURITY',
    resourceType: 'User',
    resourceId: (req) => req.principal?.userId,
  })
  @ApiOperation({ summary: 'Disable two-step verification (requires password)' })
  @ApiZodBody(PasswordSchema)
  @ApiEnvelope(200, 'Disabled')
  async disableMfa(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(PasswordSchema)) body: z.infer<typeof PasswordSchema>,
  ): Promise<ApiResult<null>> {
    await this.disableMfaUseCase.execute(principal, body.password);
    return this.empty('Two-step verification disabled.');
  }
}
