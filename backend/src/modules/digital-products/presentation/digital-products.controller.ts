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
import {
  AVAILABILITIES,
  DEPLOYMENTS,
  PLATFORMS,
  PRODUCT_STATUSES,
  SUPPORT_STATUSES,
} from '#modules/marketplace/domain/marketplace.constants.js';
import type { DigitalProduct } from '../domain/digital-product.entity.js';
import {
  CreateDigitalProductUseCase,
  DeleteDigitalProductUseCase,
  GetDigitalProductUseCase,
  ListDigitalProductsUseCase,
  UpdateDigitalProductUseCase,
} from '../application/digital-product.use-cases.js';
import { contentOf, DocSectionSchema, ProductContentSchema } from './product-content.schema.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const DigitalProductDto = apiSchema(
  'DigitalProduct',
  z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    tagline: z.string().nullable(),
    summary: z.string(),
    overview: z.string().nullable(),
    problem: z.string().nullable(),
    categoryCode: z.string(),
    status: z.enum(PRODUCT_STATUSES),
    availability: z.enum(AVAILABILITIES),
    featured: z.boolean(),
    customizable: z.boolean(),
    icon: z.string().nullable(),
    accent: z.string().nullable(),
    /** Codes of the "marketplace-industries" / "marketplace-needs" reference lists (lower case). */
    industries: z.array(z.string()),
    needs: z.array(z.string()),
    deployment: z.array(z.enum(DEPLOYMENTS)),
    platforms: z.array(z.enum(PLATFORMS)),
    keyFeatures: z.array(z.string()),
    content: ProductContentSchema.zod,
    /** Approved internal documentation (staff only; never in the public catalog). */
    documentation: z.array(DocSectionSchema.zod),
    /** Expected release (YYYY-MM-DD) of an upcoming product. */
    releaseDate: z.iso.date().nullable(),
    /** product_developers id answering customer questions, and an optional backup. */
    developerId: z.uuid().nullable(),
    backupDeveloperId: z.uuid().nullable(),
    /** Optional third developer (questions go to all assigned developers). */
    thirdDeveloperId: z.uuid().nullable(),
    supportStatus: z.enum(SUPPORT_STATUSES),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type DigitalProductDto = ApiDto<typeof DigitalProductDto>;

const toDto = (e: DigitalProduct): DigitalProductDto => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  tagline: e.tagline,
  summary: e.summary,
  overview: e.overview,
  problem: e.problem,
  categoryCode: e.categoryCode,
  status: e.status as DigitalProductDto['status'],
  availability: e.availability as DigitalProductDto['availability'],
  featured: e.featured,
  customizable: e.customizable,
  icon: e.icon,
  accent: e.accent,
  industries: e.industries,
  needs: e.needs,
  deployment: e.deployment as DigitalProductDto['deployment'],
  platforms: e.platforms as DigitalProductDto['platforms'],
  keyFeatures: e.keyFeatures,
  content: contentOf(e),
  documentation: e.documentation,
  releaseDate: e.releaseDate,
  developerId: e.developerId,
  backupDeveloperId: e.backupDeveloperId,
  thirdDeveloperId: e.thirdDeveloperId,
  supportStatus: e.supportStatus as DigitalProductDto['supportStatus'],
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: ['slug', 'name', 'categoryCode', 'status', 'availability', 'createdAt', 'updatedAt'],
  filterable: [
    'id',
    'slug',
    'name',
    'categoryCode',
    'status',
    'availability',
    'featured',
    'customizable',
  ],
  searchable: true,
};

const text = (max: number) => z.string().trim().max(max);
const Fields = {
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  tagline: text(160).nullish(),
  summary: z.string().trim().min(1).max(300),
  overview: text(2000).nullish(),
  problem: text(2000).nullish(),
  categoryCode: z.string().trim().min(1).max(60),
  status: z.enum(PRODUCT_STATUSES),
  availability: z.enum(AVAILABILITIES),
  featured: z.boolean().optional(),
  customizable: z.boolean().optional(),
  icon: text(40).nullish(),
  accent: text(7).nullish(),
  industries: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  needs: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  deployment: z.array(z.enum(DEPLOYMENTS)).max(3).optional(),
  platforms: z.array(z.enum(PLATFORMS)).max(4).optional(),
  keyFeatures: z.array(text(120)).max(6).optional(),
  content: ProductContentSchema.zod.optional(),
  documentation: z.array(DocSectionSchema.zod).max(30).optional(),
  releaseDate: z.iso.date().nullish(),
  developerId: z.uuid().nullish(),
  backupDeveloperId: z.uuid().nullish(),
  thirdDeveloperId: z.uuid().nullish(),
  supportStatus: z.enum(SUPPORT_STATUSES).optional(),
};
const CreateSchema = z.strictObject(Fields);
const UpdateSchema = CreateSchema.partial().extend({ version: z.int().min(1) });

/** Digital products API (staff). Writes go through the maker–checker gate. */
@ApiTags('Digital products')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'digital-products', version: '1' })
export class DigitalProductsController extends BaseController {
  constructor(
    private readonly listDigitalProducts: ListDigitalProductsUseCase,
    private readonly getDigitalProduct: GetDigitalProductUseCase,
    private readonly createDigitalProduct: CreateDigitalProductUseCase,
    private readonly updateDigitalProduct: UpdateDigitalProductUseCase,
    private readonly deleteDigitalProduct: DeleteDigitalProductUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('digital-products:read')
  @ApiOperation({ summary: 'List digital products (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Digital products', DigitalProductDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<DigitalProductDto[]>> {
    return this.paginated(await this.listDigitalProducts.execute(request), toDto);
  }

  @Get(':id')
  @RequirePermissions('digital-products:read')
  @ApiOperation({ summary: 'Get a digital product (including internal documentation)' })
  @ApiEnvelope(200, 'Digital product', DigitalProductDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<DigitalProductDto>> {
    return this.ok(toDto(await this.getDigitalProduct.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('digital-products:create')
  @Audit({
    action: 'DIGITAL_PRODUCTS_CREATE',
    category: 'DATA_CHANGE',
    resourceType: 'DigitalProduct',
  })
  @ApiOperation({ summary: 'Create a digital product; 202 when it needs approval' })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', DigitalProductDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<DigitalProductDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'digital-products.create',
      principal,
      payload: body,
      comment: reason,
      execute: () => this.createDigitalProduct.execute({ ...body, principal }),
    });
    return this.gated(outcome, toDto, 'Digital product created.');
  }

  @Patch(':id')
  @RequirePermissions('digital-products:update')
  @Audit({
    action: 'DIGITAL_PRODUCTS_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'DigitalProduct',
  })
  @ApiOperation({
    summary: 'Update a digital product (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', DigitalProductDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<DigitalProductDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'digital-products.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () => this.updateDigitalProduct.execute({ ...body, id, principal }),
    });
    return this.gated(outcome, toDto, 'Digital product updated.');
  }

  @Delete(':id')
  @RequirePermissions('digital-products:delete')
  @Audit({
    action: 'DIGITAL_PRODUCTS_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'DigitalProduct',
  })
  @ApiOperation({ summary: 'Delete a digital product; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', DigitalProductDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<DigitalProductDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'digital-products.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteDigitalProduct.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Digital product deleted.');
  }
}
