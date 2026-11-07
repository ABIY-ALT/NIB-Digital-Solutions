import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
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
import type { ApiResult } from '#core/presentation/http/api-response.js';
import {
  apiSchema,
  isoDateTime,
  nullableIsoDateTime,
  type ApiDto,
} from '#core/presentation/openapi/api-schema.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import {
  AuthenticatedOnly,
  RequirePermissions,
} from '#modules/authorization/presentation/authorization.decorators.js';
import { ApprovalGateService } from '../application/approval-gate.service.js';
import { ApprovalUseCases, type ApprovalAccess } from '../application/approval.use-cases.js';
import type { ApprovalRequest } from '../domain/approval-request.js';

// ── Contract ─────────────────────────────────────────────────────────────────

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'] as const;
const actor = z.object({ id: z.string(), name: z.string() });

export const ApprovalRequestDto = apiSchema(
  'ApprovalRequest',
  z.object({
    id: z.uuid(),
    action: z.string(),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    summary: z.string(),
    status: z.enum(STATUSES),
    maker: actor,
    makerComment: z.string().nullable(),
    checker: actor.nullable(),
    checkerComment: z.string().nullable(),
    /** Record before and after the change. */
    before: z.record(z.string(), z.unknown()).nullable(),
    after: z.record(z.string(), z.unknown()).nullable(),
    /** Only the fields that change (the reviewer's diff). */
    changes: z.array(z.object({ field: z.string(), before: z.unknown(), after: z.unknown() })),
    checkerPermissions: z.array(z.string()),
    createdAt: isoDateTime(),
    decidedAt: nullableIsoDateTime(),
    expiresAt: isoDateTime(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    canDecide: z.boolean(),
    canCancel: z.boolean(),
    version: z.int(),
  }),
);
type ApprovalRequestDto = ApiDto<typeof ApprovalRequestDto>;

export const ApprovalTicketDto = apiSchema(
  'ApprovalTicket',
  z.object({
    approvalId: z.uuid(),
    status: z.literal('PENDING'),
    action: z.string(),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    summary: z.string(),
    expiresAt: isoDateTime(),
  }),
);

export const ApprovalSummaryDto = apiSchema(
  'ApprovalSummary',
  z.object({ inbox: z.int(), mine: z.int() }),
);

export const ApprovalPolicyEntryDto = apiSchema(
  'ApprovalPolicyEntry',
  z.object({
    action: z.string(),
    resourceType: z.string(),
    checkerPermissions: z.array(z.string()),
    required: z.boolean(),
  }),
);

function toDto(r: ApprovalRequest, access: ApprovalAccess): ApprovalRequestDto {
  const s = r.toSnapshot();
  return {
    id: s.id,
    action: s.action,
    resourceType: s.resourceType,
    resourceId: s.resourceId,
    summary: s.summary,
    status: s.status,
    maker: s.maker,
    makerComment: s.makerComment,
    checker: s.checker,
    checkerComment: s.checkerComment,
    before: s.before,
    after: s.after,
    changes: r.changes(),
    checkerPermissions: s.checkerPermissions,
    createdAt: s.createdAt.toISOString(),
    decidedAt: s.decidedAt?.toISOString() ?? null,
    expiresAt: s.expiresAt.toISOString(),
    errorCode: s.errorCode,
    errorMessage:
      s.status === 'FAILED' && typeof s.result?.message === 'string' ? s.result.message : null,
    canDecide: access.canDecide,
    canCancel: access.canCancel,
    version: s.version,
  };
}

// ── Requests ─────────────────────────────────────────────────────────────────

const csv = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .optional();

const ListSchema = z.object({
  box: z.enum(['inbox', 'mine', 'history', 'all']).default('inbox'),
  status: csv.pipe(z.array(z.enum(STATUSES)).optional()),
  action: z.string().trim().max(96).optional(),
  resourceType: z.string().trim().max(64).optional(),
  resourceId: z.string().trim().max(128).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const PendingSchema = z.object({
  resourceType: z.string().trim().min(1).max(64),
  ids: csv.pipe(z.array(z.string().max(128)).max(200).default([])),
});

const ApproveSchema = z.strictObject({ comment: z.string().trim().max(1000).nullish() });
const RejectSchema = z.strictObject({ comment: z.string().trim().min(3).max(1000) });

/** Maker–checker inbox, request details and decisions. */
@ApiTags('Approvals')
@ApiAuth()
@ApiStandardErrors()
@AuthenticatedOnly()
@Controller({ path: 'approvals', version: '1' })
export class ApprovalsController extends BaseController {
  constructor(
    private readonly approvals: ApprovalUseCases,
    private readonly gate: ApprovalGateService,
  ) {
    super();
  }

  @Get()
  @ApiOperation({
    summary: 'Approval requests: inbox (to decide), mine (submitted), history (decided by me), all',
  })
  @ApiEnvelope(200, 'Approval requests', ApprovalRequestDto, true)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query(zod(ListSchema)) query: z.infer<typeof ListSchema>,
  ): Promise<ApiResult<ApprovalRequestDto[]>> {
    const page = await this.approvals.list(principal, query);
    return this.paginated(page, (r) => toDto(r, this.approvals.access(principal, r)));
  }

  @Get('summary')
  @ApiOperation({ summary: 'Counters: waiting for me, and my own pending requests' })
  @ApiEnvelope(200, 'Summary', ApprovalSummaryDto)
  async summary(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<ApiDto<typeof ApprovalSummaryDto>>> {
    return this.ok(await this.approvals.summary(principal));
  }

  @Get('policy')
  @ApiOperation({ summary: 'Which actions require a checker (and who may decide them)' })
  @ApiEnvelope(200, 'Policy', { type: 'array', items: ApprovalPolicyEntryDto.ref })
  policy(): ApiResult<Array<ApiDto<typeof ApprovalPolicyEntryDto>>> {
    return this.ok(this.gate.catalogue());
  }

  @Get('pending')
  @ApiOperation({ summary: 'Pending requests for the given records (resource id → approval id)' })
  @ApiEnvelope(200, 'Pending approvals by resource id')
  async pending(
    @Query(zod(PendingSchema)) query: z.infer<typeof PendingSchema>,
  ): Promise<ApiResult<Record<string, string>>> {
    const map = await this.approvals.pendingFor(query.resourceType, query.ids);
    return this.ok(Object.fromEntries(map));
  }

  @Get(':id')
  @ApiOperation({ summary: 'An approval request with its before/after diff' })
  @ApiEnvelope(200, 'Approval request', ApprovalRequestDto)
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
  ): Promise<ApiResult<ApprovalRequestDto>> {
    const request = await this.approvals.get(principal, id);
    return this.ok(toDto(request, this.approvals.access(principal, request)));
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('approvals:approve')
  @Audit({ action: 'APPROVAL_APPROVE', category: 'DATA_CHANGE', resourceType: 'ApprovalRequest' })
  @ApiOperation({ summary: 'Approve (checker ≠ maker); the change is applied immediately' })
  @ApiZodBody(ApproveSchema)
  @ApiEnvelope(200, 'Decided', ApprovalRequestDto)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(ApproveSchema)) body: z.infer<typeof ApproveSchema>,
  ): Promise<ApiResult<ApprovalRequestDto>> {
    const request = await this.approvals.approve(principal, id, body.comment ?? null);
    return this.ok(
      toDto(request, this.approvals.access(principal, request)),
      request.status === 'FAILED'
        ? 'Approved, but the change could not be applied.'
        : 'Approved and applied.',
    );
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('approvals:approve')
  @Audit({ action: 'APPROVAL_REJECT', category: 'DATA_CHANGE', resourceType: 'ApprovalRequest' })
  @ApiOperation({ summary: 'Reject with a reason (checker ≠ maker)' })
  @ApiZodBody(RejectSchema)
  @ApiEnvelope(200, 'Rejected', ApprovalRequestDto)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(RejectSchema)) body: z.infer<typeof RejectSchema>,
  ): Promise<ApiResult<ApprovalRequestDto>> {
    const request = await this.approvals.reject(principal, id, body.comment);
    return this.ok(toDto(request, this.approvals.access(principal, request)), 'Request rejected.');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit({ action: 'APPROVAL_CANCEL', category: 'DATA_CHANGE', resourceType: 'ApprovalRequest' })
  @ApiOperation({ summary: 'Withdraw my pending request' })
  @ApiEnvelope(200, 'Withdrawn', ApprovalRequestDto)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
  ): Promise<ApiResult<ApprovalRequestDto>> {
    const request = await this.approvals.cancel(principal, id);
    return this.ok(toDto(request, this.approvals.access(principal, request)), 'Request withdrawn.');
  }
}
