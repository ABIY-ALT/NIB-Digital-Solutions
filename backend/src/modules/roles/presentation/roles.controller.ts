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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
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
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import {
  ApiChangeReason,
  ChangeReason,
} from '#core/presentation/decorators/change-reason.decorator.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { apiSchema, isoDateTime, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import {
  ApiListQuery,
  ListQuery,
  type ListQuerySpec,
} from '#core/presentation/pagination/list-query.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import { RequirePermissions } from '#modules/authorization/presentation/authorization.decorators.js';
import type { Role } from '../domain/role.entity.js';
import type { PermissionDefinition } from '../domain/role.repository.js';
import {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  GetRoleUseCase,
  ListPermissionsUseCase,
  ListRolesUseCase,
  UpdateRoleUseCase,
} from '../application/role.use-cases.js';

const ROLE_LIST_SPEC: ListQuerySpec = {
  sortable: ['code', 'name', 'createdAt'],
  filterable: ['id', 'isSystem'],
  searchable: true,
};

const permissionList = z.array(z.string().trim().min(1).max(128)).max(200);

export const CreateRoleSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'Use 2–64 uppercase letters, digits or underscores'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  permissions: permissionList,
});

export const UpdateRoleSchema = z.strictObject({
  version: z.int().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullish(),
  permissions: permissionList.optional(),
});

const IdSchema = z.uuid();

export const RoleDtoSchema = apiSchema(
  'Role',
  z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    permissions: z.array(z.string()),
    userCount: z.int(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
export type RoleDto = ApiDto<typeof RoleDtoSchema>;

export const PermissionDefinitionDto = apiSchema(
  'PermissionDefinition',
  z.object({ code: z.string(), description: z.string().nullable() }),
);

const toDto = (r: Role): RoleDto => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  permissions: [...r.permissionCodes],
  userCount: r.userCount,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  version: r.version,
});

@ApiTags('Roles')
@ApiAuth()
@ApiStandardErrors()
@Controller({ version: '1' })
export class RolesController extends BaseController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly getRole: GetRoleUseCase,
    private readonly listPermissions: ListPermissionsUseCase,
    private readonly createRole: CreateRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get('permissions')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Permission catalogue (assignable permission codes)' })
  @ApiEnvelope(200, 'Permissions', { type: 'array', items: PermissionDefinitionDto.ref })
  async permissions(): Promise<ApiResult<PermissionDefinition[]>> {
    return this.ok(await this.listPermissions.execute());
  }

  @Get('roles')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'List roles (paginated, searchable)' })
  @ApiListQuery(ROLE_LIST_SPEC)
  @ApiEnvelope(200, 'Roles', RoleDtoSchema, true)
  async list(@ListQuery(ROLE_LIST_SPEC) request: PageRequest): Promise<ApiResult<RoleDto[]>> {
    return this.paginated(await this.listRoles.execute(request), toDto);
  }

  @Get('roles/:id')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Get a role' })
  @ApiEnvelope(200, 'Role', RoleDtoSchema)
  async get(@Param('id', zod(IdSchema)) id: string): Promise<ApiResult<RoleDto>> {
    return this.ok(toDto(await this.getRole.execute(id)));
  }

  @Post('roles')
  @HttpCode(201)
  @RequirePermissions('roles:create')
  @Audit({ action: 'ROLE_CREATE', category: 'SECURITY', resourceType: 'Role' })
  @ApiOperation({
    summary: 'Create a role (only with permissions you hold); 202 when it needs approval',
  })
  @ApiZodBody(CreateRoleSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', RoleDtoSchema)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateRoleSchema)) body: z.infer<typeof CreateRoleSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<RoleDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'roles.create',
      principal,
      payload: body,
      comment: reason,
      execute: () => this.createRole.execute({ principal, ...body }),
    });
    return this.gated(outcome, toDto, 'Role created.');
  }

  @Patch('roles/:id')
  @RequirePermissions('roles:update')
  @Audit({
    action: 'ROLE_UPDATE',
    category: 'SECURITY',
    resourceType: 'Role',
    metadata: (req) => ({ permissions: (req.body as { permissions?: string[] }).permissions }),
  })
  @ApiOperation({
    summary: 'Update a role (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateRoleSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', RoleDtoSchema)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(IdSchema)) id: string,
    @Body(zod(UpdateRoleSchema)) body: z.infer<typeof UpdateRoleSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<RoleDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'roles.update',
      principal,
      payload: { id, ...body },
      comment: reason,
      execute: () => this.updateRole.execute({ principal, id, ...body }),
    });
    return this.gated(outcome, toDto, 'Role updated.');
  }

  @Delete('roles/:id')
  @RequirePermissions('roles:delete')
  @Audit({ action: 'ROLE_DELETE', category: 'SECURITY', resourceType: 'Role' })
  @ApiOperation({
    summary: 'Delete a role (not system roles, not roles in use); 202 when it needs approval',
  })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', RoleDtoSchema)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(IdSchema)) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<RoleDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'roles.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteRole.execute({ principal, id }),
    });
    return this.gated(outcome, toDto, 'Role deleted.');
  }
}
