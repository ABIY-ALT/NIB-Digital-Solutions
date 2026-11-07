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
  CONTACT_METHODS,
  INQUIRY_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
} from '#modules/marketplace/domain/marketplace.constants.js';
import { LeadNoteSchema } from '#modules/marketplace/presentation/lead-note.schema.js';
import type { ProductInquiry } from '../domain/product-inquiry.entity.js';
import {
  AddProductInquiryNoteUseCase,
  CreateProductInquiryUseCase,
  DeleteProductInquiryUseCase,
  GetProductInquiryUseCase,
  ListProductInquiriesUseCase,
  UpdateProductInquiryUseCase,
} from '../application/product-inquiry.use-cases.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const ProductInquiryDto = apiSchema(
  'ProductInquiry',
  z.object({
    id: z.uuid(),
    reference: z.string(),
    customerName: z.string(),
    company: z.string().nullable(),
    email: z.string(),
    phone: z.string().nullable(),
    productSlug: z.string().nullable(),
    inquiryType: z.enum(INQUIRY_TYPES),
    message: z.string(),
    requirements: z.string().nullable(),
    contactMethod: z.enum(CONTACT_METHODS),
    source: z.string().nullable(),
    status: z.enum(LEAD_STATUSES),
    assignedTo: z.string().nullable(),
    respondedAt: isoDateTime().nullable(),
    notes: z.array(LeadNoteSchema.zod),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type ProductInquiryDto = ApiDto<typeof ProductInquiryDto>;

const toDto = (e: ProductInquiry): ProductInquiryDto => ({
  id: e.id,
  reference: e.reference,
  customerName: e.customerName,
  company: e.company,
  email: e.email,
  phone: e.phone,
  productSlug: e.productSlug,
  inquiryType: e.inquiryType as ProductInquiryDto['inquiryType'],
  message: e.message,
  requirements: e.requirements,
  contactMethod: e.contactMethod as ProductInquiryDto['contactMethod'],
  source: e.source,
  status: e.status as ProductInquiryDto['status'],
  assignedTo: e.assignedTo,
  respondedAt: e.respondedAt?.toISOString() ?? null,
  notes: e.notes,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: [
    'reference',
    'customerName',
    'company',
    'productSlug',
    'inquiryType',
    'status',
    'respondedAt',
    'createdAt',
    'updatedAt',
  ],
  filterable: [
    'id',
    'reference',
    'productSlug',
    'inquiryType',
    'contactMethod',
    'source',
    'status',
    'assignedTo',
    'createdAt',
  ],
  searchable: true,
};

const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date());
const toDate = (v: string | null | undefined) =>
  v === undefined ? undefined : v ? new Date(v) : null;

/** Staff entry of an inquiry received by phone, e-mail or in person. */
const CreateSchema = z.strictObject({
  customerName: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).nullish(),
  email: z.string().trim().max(160),
  phone: z.string().trim().max(40).nullish(),
  productSlug: z.string().trim().max(80).nullish(),
  inquiryType: z.enum(INQUIRY_TYPES),
  message: z.string().trim().min(10).max(2000),
  requirements: z.string().trim().max(2000).nullish(),
  contactMethod: z.enum(CONTACT_METHODS),
  source: z.enum(LEAD_SOURCES).nullish(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().trim().max(160).nullish(),
});
/** Workflow fields only: the customer's details are not editable. */
const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().trim().max(160).nullish(),
  respondedAt: isoDate.nullish(),
});
const NoteSchema = z.strictObject({ body: z.string().trim().min(1).max(2000) });

/** Product inquiries API (staff). Writes go through the maker–checker gate. */
@ApiTags('Product inquiries')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'product-inquiries', version: '1' })
export class ProductInquiriesController extends BaseController {
  constructor(
    private readonly listProductInquiries: ListProductInquiriesUseCase,
    private readonly getProductInquiry: GetProductInquiryUseCase,
    private readonly createProductInquiry: CreateProductInquiryUseCase,
    private readonly updateProductInquiry: UpdateProductInquiryUseCase,
    private readonly deleteProductInquiry: DeleteProductInquiryUseCase,
    private readonly addNote: AddProductInquiryNoteUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('product-inquiries:read')
  @ApiOperation({ summary: 'List product inquiries (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Product inquiries', ProductInquiryDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<ProductInquiryDto[]>> {
    return this.paginated(await this.listProductInquiries.execute(request), toDto);
  }

  @Get(':id')
  @RequirePermissions('product-inquiries:read')
  @ApiOperation({ summary: 'Get a product inquiry' })
  @ApiEnvelope(200, 'Product inquiry', ProductInquiryDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<ProductInquiryDto>> {
    return this.ok(toDto(await this.getProductInquiry.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('product-inquiries:create')
  @Audit({
    action: 'PRODUCT_INQUIRIES_CREATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductInquiry',
  })
  @ApiOperation({
    summary: 'Record an inquiry on behalf of a customer; 202 when it needs approval',
  })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', ProductInquiryDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductInquiryDto | ApprovalTicket>> {
    // The reference is part of the payload so an approved request keeps it.
    const payload = {
      ...body,
      reference: makeReference('INQ'),
      status: body.status ?? 'new',
      source: body.source ?? 'staff',
    };
    const outcome = await this.approvals.submit({
      action: 'product-inquiries.create',
      principal,
      payload,
      comment: reason,
      execute: () => this.createProductInquiry.execute({ ...payload, principal }),
    });
    return this.gated(outcome, toDto, 'Inquiry recorded.');
  }

  @Patch(':id')
  @RequirePermissions('product-inquiries:update')
  @Audit({
    action: 'PRODUCT_INQUIRIES_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductInquiry',
  })
  @ApiOperation({ summary: 'Update status, owner or response time (requires the current version)' })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', ProductInquiryDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductInquiryDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-inquiries.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () =>
        this.updateProductInquiry.execute({
          ...body,
          respondedAt: toDate(body.respondedAt),
          id,
          principal,
        }),
    });
    return this.gated(outcome, toDto, 'Inquiry updated.');
  }

  @Post(':id/notes')
  @HttpCode(201)
  @RequirePermissions('product-inquiries:update')
  @Audit({
    action: 'PRODUCT_INQUIRIES_NOTE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductInquiry',
  })
  @ApiOperation({ summary: 'Add an internal follow-up note' })
  @ApiZodBody(NoteSchema)
  @ApiEnvelope(201, 'Note added', ProductInquiryDto)
  async note(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(NoteSchema)) body: z.infer<typeof NoteSchema>,
  ): Promise<ApiResult<ProductInquiryDto>> {
    return this.ok(
      toDto(await this.addNote.execute({ principal, id, body: body.body })),
      'Note added.',
    );
  }

  @Delete(':id')
  @RequirePermissions('product-inquiries:delete')
  @Audit({
    action: 'PRODUCT_INQUIRIES_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductInquiry',
  })
  @ApiOperation({ summary: 'Delete an inquiry; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', ProductInquiryDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductInquiryDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-inquiries.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteProductInquiry.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Inquiry deleted.');
  }
}
