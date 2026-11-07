import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalTicket,
} from '#core/application/ports/approval.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { PageRequest } from '#core/domain/pagination.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiIdempotencyKey,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import {
  ApiChangeReason,
  ChangeReason,
} from '#core/presentation/decorators/change-reason.decorator.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit, Idempotent } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import {
  ApiListQuery,
  ListQuery,
  type ListQuerySpec,
} from '#core/presentation/pagination/list-query.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import {
  AuthenticatedOnly,
  RequirePermissions,
} from '#modules/authorization/presentation/authorization.decorators.js';
import { CreateUserUseCase } from '../application/create-user.use-case.js';
import { DeleteUserUseCase } from '../application/delete-user.use-case.js';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case.js';
import { GetUserUseCase } from '../application/get-user.use-case.js';
import { SECURITY_POLICY } from '../application/password-policy.service.js';
import { ListUsersUseCase } from '../application/list-users.use-case.js';
import { RestoreUserUseCase } from '../application/restore-user.use-case.js';
import { UpdateMyProfileUseCase } from '../application/update-my-profile.use-case.js';
import { UpdateUserUseCase } from '../application/update-user.use-case.js';
import {
  EndUserSessionsUseCase,
  ResetUserPasswordUseCase,
  UnlockUserUseCase,
} from '../application/user-admin.use-cases.js';
import type { SecurityPolicy } from '../domain/password-policy.js';
import {
  userResponseMapper,
  UserDtoSchema,
  UserProfileDtoSchema,
  type UserDto,
  type UserProfileDto,
} from './user.response-mapper.js';
import {
  CreateUserSchema,
  ResetPasswordSchema,
  UpdateMyProfileSchema,
  UpdateUserSchema,
  UserIdParamSchema,
  VersionQuerySchema,
  type CreateUserBody,
  type UpdateMyProfileBody,
  type UpdateUserBody,
} from './user.schemas.js';

export const USER_LIST_SPEC: ListQuerySpec = {
  sortable: ['username', 'fullName', 'email', 'status', 'createdAt', 'lastLoginAt'],
  filterable: ['id', 'status', 'branchCode', 'mfaEnabled', 'createdAt'],
  searchable: true,
};

@ApiTags('Users')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'users', version: '1' })
export class UsersController extends BaseController {
  constructor(
    private readonly getCurrentUser: GetCurrentUserUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly restoreUser: RestoreUserUseCase,
    private readonly unlockUser: UnlockUserUseCase,
    private readonly resetUserPassword: ResetUserPasswordUseCase,
    private readonly endUserSessions: EndUserSessionsUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
    @Inject(SECURITY_POLICY) private readonly policy: SecurityPolicy,
    private readonly updateMyProfile: UpdateMyProfileUseCase,
  ) {
    super();
  }

  @Get('me')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Current user profile (roles and effective permissions)' })
  @ApiEnvelope(200, 'Profile', UserProfileDtoSchema)
  async me(@CurrentPrincipal() principal: Principal): Promise<ApiResult<UserProfileDto>> {
    return this.ok(
      userResponseMapper.toProfile(await this.getCurrentUser.execute(principal), this.policy),
    );
  }

  @Patch('me')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Update my display name and phone number (self-service)' })
  @ApiZodBody(UpdateMyProfileSchema)
  @ApiEnvelope(200, 'Profile', UserProfileDtoSchema)
  @Audit({
    action: 'PROFILE_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'User',
    resourceId: (req) => req.principal?.userId ?? null,
  })
  async updateMe(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(UpdateMyProfileSchema)) body: UpdateMyProfileBody,
  ): Promise<ApiResult<UserProfileDto>> {
    const user = await this.updateMyProfile.execute(principal, body);
    return this.ok(userResponseMapper.toProfile(user, this.policy), 'Profile updated.');
  }

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List users (scoped by the caller’s grant: all / branch / own)' })
  @ApiListQuery(USER_LIST_SPEC)
  @ApiEnvelope(200, 'Users', UserDtoSchema, true)
  async list(
    @CurrentPrincipal() principal: Principal,
    @ListQuery(USER_LIST_SPEC) request: PageRequest,
  ): Promise<ApiResult<UserDto[]>> {
    const page = await this.listUsers.execute({ principal, request });
    return this.paginated(page, (u) => userResponseMapper.toDto(u));
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @Audit({ action: 'USER_VIEW', category: 'DATA_ACCESS', resourceType: 'User' })
  @ApiOperation({ summary: 'Get a user by id (ABAC: own / branch / any)' })
  @ApiEnvelope(200, 'User', UserDtoSchema)
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(UserIdParamSchema)) id: string,
  ): Promise<ApiResult<UserDto>> {
    return this.ok(userResponseMapper.toDto(await this.getUser.execute({ principal, id })));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('users:create')
  @Idempotent()
  @Audit({ action: 'USER_CREATE', category: 'DATA_CHANGE', resourceType: 'User' })
  @ApiOperation({ summary: 'Create a user (transactional, idempotent, audited)' })
  @ApiIdempotencyKey()
  @ApiZodBody(CreateUserSchema)
  @ApiEnvelope(201, 'Created', UserDtoSchema)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateUserSchema)) body: CreateUserBody,
  ): Promise<ApiResult<UserDto>> {
    const user = await this.createUser.execute({ principal, ...body });
    return this.ok(userResponseMapper.toDto(user), 'User created.');
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  @Audit({
    action: 'USER_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'User',
    metadata: (req) => ({
      fields: Object.keys((req.body as object) ?? {}).filter((k) => k !== 'version'),
    }),
  })
  @ApiOperation({
    summary: 'Update a user (requires the current `version`, optimistic concurrency)',
  })
  @ApiZodBody(UpdateUserSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', UserDtoSchema)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(UserIdParamSchema)) id: string,
    @Body(zod(UpdateUserSchema)) body: UpdateUserBody,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<UserDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'users.update',
      principal,
      payload: { id, ...body },
      comment: reason,
      execute: () => this.updateUser.execute({ principal, id, ...body }),
    });
    return this.gated(outcome, (u) => userResponseMapper.toDto(u), 'User updated.');
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  @Audit({ action: 'USER_DELETE', category: 'DATA_CHANGE', resourceType: 'User' })
  @ApiOperation({
    summary: 'Soft-delete a user and end their sessions; 202 when it needs approval',
  })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', UserDtoSchema)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(UserIdParamSchema)) id: string,
    @Query(zod(VersionQuerySchema)) query: { version?: number },
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<UserDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'users.delete',
      principal,
      payload: { id, version: query.version },
      comment: reason,
      execute: () => this.deleteUser.execute({ principal, id, version: query.version }),
    });
    return this.gated(outcome, (u) => userResponseMapper.toDto(u), 'User deleted.');
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions('users:restore')
  @Audit({ action: 'USER_RESTORE', category: 'DATA_CHANGE', resourceType: 'User' })
  @ApiOperation({ summary: 'Restore a soft-deleted user' })
  @ApiEnvelope(200, 'Restored', UserDtoSchema)
  async restore(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(UserIdParamSchema)) id: string,
  ): Promise<ApiResult<UserDto>> {
    const user = await this.restoreUser.execute({ principal, id });
    return this.ok(userResponseMapper.toDto(user), 'User restored.');
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @RequirePermissions('users:update')
  @Audit({ action: 'USER_UNLOCK', category: 'SECURITY', resourceType: 'User' })
  @ApiOperation({ summary: 'Unlock an account locked after failed sign-ins' })
  @ApiEnvelope(200, 'Unlocked', UserDtoSchema)
  async unlock(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(UserIdParamSchema)) id: string,
  ): Promise<ApiResult<UserDto>> {
    return this.ok(
      userResponseMapper.toDto(await this.unlockUser.execute(principal, id)),
      'Account unlocked.',
    );
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermissions('users:reset-password')
  @Audit({ action: 'USER_PASSWORD_RESET', category: 'SECURITY', resourceType: 'User' })
  @ApiOperation({ summary: "Set a temporary password and end the user's sessions" })
  @ApiZodBody(ResetPasswordSchema)
  @ApiEnvelope(200, 'Password reset', UserDtoSchema)
  async resetPassword(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(UserIdParamSchema)) id: string,
    @Body(zod(ResetPasswordSchema)) body: { newPassword: string },
  ): Promise<ApiResult<UserDto>> {
    const user = await this.resetUserPassword.execute(principal, id, body.newPassword);
    return this.ok(userResponseMapper.toDto(user), 'Password reset.');
  }

  @Post(':id/sessions/terminate')
  @HttpCode(200)
  @RequirePermissions('users:update')
  @Audit({ action: 'USER_SESSIONS_TERMINATE', category: 'SECURITY', resourceType: 'User' })
  @ApiOperation({ summary: 'Sign the user out of every device' })
  @ApiEnvelope(200, 'Sessions ended')
  async terminateSessions(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(UserIdParamSchema)) id: string,
  ): Promise<ApiResult<{ terminated: number }>> {
    return this.ok(await this.endUserSessions.execute(principal, id), 'Sessions ended.');
  }
}
