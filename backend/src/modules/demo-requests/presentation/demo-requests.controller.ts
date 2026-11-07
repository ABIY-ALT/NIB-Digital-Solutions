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
import { makeReference } from '#modules/marketplace/domain/lead-rules.js';
import {
  DEMO_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
} from '#modules/marketplace/domain/marketplace.constants.js';
import { LeadNoteSchema } from '#modules/marketplace/presentation/lead-note.schema.js';
import type { DemoRequest } from '../domain/demo-request.entity.js';
import {
  AddDemoRequestNoteUseCase,
  CreateDemoRequestUseCase,
  DeleteDemoRequestUseCase,
  GetDemoRequestUseCase,
  ListDemoRequestsUseCase,
  UpdateDemoRequestUseCase,
} from '../application/demo-request.use-cases.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const DemoRequestDto = apiSchema(
  'DemoRequest',
  z.object({
    id: z.uuid(),
    reference: z.string(),
    fullName: z.string(),
    organization: z.string(),
    jobTitle: z.string(),
    email: z.string(),
    phone: z.string(),
    productSlug: z.string(),
    demoType: z.enum(DEMO_TYPES),
    preferredDate: isoDateTime().nullable(),
    preferredTime: z.string().nullable(),
    requirements: z.string().nullable(),
    source: z.string().nullable(),
    status: z.enum(LEAD_STATUSES),
    assignedTo: z.string().nullable(),
    followUpDate: isoDateTime().nullable(),
    notes: z.array(LeadNoteSchema.zod),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type DemoRequestDto = ApiDto<typeof DemoRequestDto>;

const toDto = (e: DemoRequest): DemoRequestDto => ({
  id: e.id,
  reference: e.reference,
  fullName: e.fullName,
  organization: e.organization,
  jobTitle: e.jobTitle,
  email: e.email,
  phone: e.phone,
  productSlug: e.productSlug,
  demoType: e.demoType as DemoRequestDto['demoType'],
  preferredDate: e.preferredDate?.toISOString() ?? null,
  preferredTime: e.preferredTime,
  requirements: e.requirements,
  source: e.source,
  status: e.status as DemoRequestDto['status'],
  assignedTo: e.assignedTo,
  followUpDate: e.followUpDate?.toISOString() ?? null,
  notes: e.notes,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: [
    'reference',
    'fullName',
    'organization',
    'productSlug',
    'demoType',
    'preferredDate',
    'status',
    'followUpDate',
    'createdAt',
    'updatedAt',
  ],
  filterable: [
    'id',
    'reference',
    'productSlug',
    'demoType',
    'source',
    'status',
    'assignedTo',
    'followUpDate',
    'createdAt',
  ],
  searchable: true,
};

const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date());
const toDate = (v: string | null | undefined) =>
  v === undefined ? undefined : v ? new Date(v) : null;

/** Staff entry of a request received by phone, e-mail or in person. */
const CreateSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(120),
  organization: z.string().trim().min(2).max(160),
  jobTitle: z.string().trim().min(2).max(120),
  email: z.string().trim().max(160),
  phone: z.string().trim().max(40),
  productSlug: z.string().trim().min(1).max(80),
  demoType: z.enum(DEMO_TYPES),
  preferredDate: isoDate.nullish(),
  preferredTime: z.string().trim().max(5).nullish(),
  requirements: z.string().trim().max(2000).nullish(),
  source: z.enum(LEAD_SOURCES).nullish(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().trim().max(160).nullish(),
});
/** Workflow fields only: the customer's details are not editable. */
const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().trim().max(160).nullish(),
  followUpDate: isoDate.nullish(),
});
const NoteSchema = z.strictObject({ body: z.string().trim().min(1).max(2000) });

/** Demo requests API (staff). Writes go through the maker–checker gate. */
@ApiTags('Demo requests')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'demo-requests', version: '1' })
export class DemoRequestsController extends BaseController {
  constructor(
    private readonly listDemoRequests: ListDemoRequestsUseCase,
    private readonly getDemoRequest: GetDemoRequestUseCase,
    private readonly createDemoRequest: CreateDemoRequestUseCase,
    private readonly updateDemoRequest: UpdateDemoRequestUseCase,
    private readonly deleteDemoRequest: DeleteDemoRequestUseCase,
    private readonly addNote: AddDemoRequestNoteUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('demo-requests:read')
  @ApiOperation({ summary: 'List demo requests (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Demo requests', DemoRequestDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<DemoRequestDto[]>> {
    return this.paginated(await this.listDemoRequests.execute(request), toDto);
  }

  @Get(':id')
  @RequirePermissions('demo-requests:read')
  @ApiOperation({ summary: 'Get a demo request' })
  @ApiEnvelope(200, 'Demo request', DemoRequestDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<DemoRequestDto>> {
    return this.ok(toDto(await this.getDemoRequest.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('demo-requests:create')
  @Audit({ action: 'DEMO_REQUESTS_CREATE', category: 'DATA_CHANGE', resourceType: 'DemoRequest' })
  @ApiOperation({
    summary: 'Record a demo request on behalf of a customer; 202 when it needs approval',
  })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', DemoRequestDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<DemoRequestDto | ApprovalTicket>> {
    // The reference is part of the payload so an approved request keeps it.
    const payload = {
      ...body,
      reference: makeReference('DEMO'),
      status: body.status ?? 'new',
      source: body.source ?? 'staff',
    };
    const outcome = await this.approvals.submit({
      action: 'demo-requests.create',
      principal,
      payload,
      comment: reason,
      execute: () =>
        this.createDemoRequest.execute({
          ...payload,
          preferredDate: toDate(payload.preferredDate),
          principal,
        }),
    });
    return this.gated(outcome, toDto, 'Demo request recorded.');
  }

  @Patch(':id')
  @RequirePermissions('demo-requests:update')
  @Audit({ action: 'DEMO_REQUESTS_UPDATE', category: 'DATA_CHANGE', resourceType: 'DemoRequest' })
  @ApiOperation({
    summary: 'Update status, owner or follow-up date (requires the current version)',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', DemoRequestDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<DemoRequestDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'demo-requests.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () =>
        this.updateDemoRequest.execute({
          ...body,
          followUpDate: toDate(body.followUpDate),
          id,
          principal,
        }),
    });
    return this.gated(outcome, toDto, 'Demo request updated.');
  }

  @Post(':id/notes')
  @HttpCode(201)
  @RequirePermissions('demo-requests:update')
  @Audit({ action: 'DEMO_REQUESTS_NOTE', category: 'DATA_CHANGE', resourceType: 'DemoRequest' })
  @ApiOperation({ summary: 'Add an internal follow-up note' })
  @ApiZodBody(NoteSchema)
  @ApiEnvelope(201, 'Note added', DemoRequestDto)
  async note(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(NoteSchema)) body: z.infer<typeof NoteSchema>,
  ): Promise<ApiResult<DemoRequestDto>> {
    return this.ok(
      toDto(await this.addNote.execute({ principal, id, body: body.body })),
      'Note added.',
    );
  }

  @Delete(':id')
  @RequirePermissions('demo-requests:delete')
  @Audit({ action: 'DEMO_REQUESTS_DELETE', category: 'DATA_CHANGE', resourceType: 'DemoRequest' })
  @ApiOperation({ summary: 'Delete a demo request; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', DemoRequestDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<DemoRequestDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'demo-requests.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteDemoRequest.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Demo request deleted.');
  }
}
