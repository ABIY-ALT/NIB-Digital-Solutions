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
import type { ProductCategory } from '../domain/product-category.entity.js';
import {
  CreateProductCategoryUseCase,
  DeleteProductCategoryUseCase,
  GetProductCategoryUseCase,
  ListProductCategoriesUseCase,
  UpdateProductCategoryUseCase,
} from '../application/product-category.use-cases.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const ProductCategoryDto = apiSchema(
  'ProductCategory',
  z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: z.int().nullable(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type ProductCategoryDto = ApiDto<typeof ProductCategoryDto>;

const toDto = (e: ProductCategory): ProductCategoryDto => ({
  id: e.id,
  code: e.code,
  name: e.name,
  description: e.description,
  icon: e.icon,
  sortOrder: e.sortOrder,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: ['code', 'name', 'icon', 'sortOrder', 'createdAt', 'updatedAt'],
  filterable: ['id', 'code', 'name', 'icon', 'sortOrder'],
  searchable: true,
};

const CreateSchema = z.strictObject({
  code: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullish(),
  icon: z.string().trim().max(160).nullish(),
  sortOrder: z.int().nullish(),
});
const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  code: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullish(),
  icon: z.string().trim().max(160).nullish(),
  sortOrder: z.int().nullish(),
});

const toInput = <T>(body: T) => body;

/** Product categories API (generated). Writes go through the maker–checker gate. */
@ApiTags('Product categories')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'product-categories', version: '1' })
export class ProductCategoriesController extends BaseController {
  constructor(
    private readonly listProductCategories: ListProductCategoriesUseCase,
    private readonly getProductCategory: GetProductCategoryUseCase,
    private readonly createProductCategory: CreateProductCategoryUseCase,
    private readonly updateProductCategory: UpdateProductCategoryUseCase,
    private readonly deleteProductCategory: DeleteProductCategoryUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('product-categories:read')
  @ApiOperation({ summary: 'List product categories (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Product categories', ProductCategoryDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<ProductCategoryDto[]>> {
    return this.paginated(await this.listProductCategories.execute(request), toDto);
  }

  @Get(':id')
  @RequirePermissions('product-categories:read')
  @ApiOperation({ summary: 'Get a product category' })
  @ApiEnvelope(200, 'Product category', ProductCategoryDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<ProductCategoryDto>> {
    return this.ok(toDto(await this.getProductCategory.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('product-categories:create')
  @Audit({
    action: 'PRODUCT_CATEGORIES_CREATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductCategory',
  })
  @ApiOperation({ summary: 'Create a product category; 202 when it needs approval' })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', ProductCategoryDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductCategoryDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-categories.create',
      principal,
      payload: body,
      comment: reason,
      execute: () => this.createProductCategory.execute({ ...input, principal }),
    });
    return this.gated(outcome, toDto, 'Product category created.');
  }

  @Patch(':id')
  @RequirePermissions('product-categories:update')
  @Audit({
    action: 'PRODUCT_CATEGORIES_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductCategory',
  })
  @ApiOperation({
    summary: 'Update a product category (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', ProductCategoryDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductCategoryDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-categories.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () => this.updateProductCategory.execute({ ...input, id, principal }),
    });
    return this.gated(outcome, toDto, 'Product category updated.');
  }

  @Delete(':id')
  @RequirePermissions('product-categories:delete')
  @Audit({
    action: 'PRODUCT_CATEGORIES_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductCategory',
  })
  @ApiOperation({ summary: 'Delete a product category; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', ProductCategoryDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductCategoryDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-categories.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteProductCategory.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Product category deleted.');
  }
}
