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
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import { assertHuman, visitorHash } from '#modules/marketplace/application/visitor-privacy.js';
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
import { Audit, Public } from '#core/presentation/decorators/metadata.decorators.js';
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
  MAX_RATING,
  MIN_RATING,
  REVIEW_STATUSES,
  type ProductReview,
} from '../domain/product-review.entity.js';
import {
  CreateProductReviewUseCase,
  DeleteProductReviewUseCase,
  GetProductReviewUseCase,
  ListProductReviewsUseCase,
  PublicProductReviewsUseCase,
  SubmitProductReviewUseCase,
  UpdateProductReviewUseCase,
} from '../application/product-review.use-cases.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const ProductReviewDto = apiSchema(
  'ProductReview',
  z.object({
    id: z.uuid(),
    reference: z.string(),
    productSlug: z.string(),
    rating: z.int(),
    title: z.string().nullable(),
    /** Null for a star rating only. */
    body: z.string().nullable(),
    reviewerName: z.string().nullable(),
    reviewerRole: z.string().nullable(),
    reviewerEmail: z.string().nullable(),
    status: z.string(),
    reply: z.string().nullable(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type ProductReviewDto = ApiDto<typeof ProductReviewDto>;

const toDto = (e: ProductReview): ProductReviewDto => ({
  id: e.id,
  reference: e.reference,
  productSlug: e.productSlug,
  rating: e.rating,
  title: e.title,
  body: e.body,
  reviewerName: e.reviewerName,
  reviewerRole: e.reviewerRole,
  reviewerEmail: e.reviewerEmail,
  status: e.status,
  reply: e.reply,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: [
    'reference',
    'productSlug',
    'rating',
    'title',
    'reviewerName',
    'reviewerRole',
    'reviewerEmail',
    'status',
    'createdAt',
    'updatedAt',
  ],
  filterable: [
    'id',
    'reference',
    'productSlug',
    'rating',
    'title',
    'reviewerName',
    'reviewerRole',
    'reviewerEmail',
    'status',
  ],
  searchable: true,
};

const CreateSchema = z.strictObject({
  reference: z.string().trim().max(160).optional(),
  productSlug: z.string().trim().min(1).max(160),
  rating: z.int().min(MIN_RATING).max(MAX_RATING),
  title: z.string().trim().max(160).nullish(),
  body: z.string().trim().max(2000).nullish(),
  reviewerName: z.string().trim().max(160).nullish(),
  reviewerRole: z.string().trim().max(160).nullish(),
  reviewerEmail: z.string().trim().max(160).nullish(),
  status: z.enum(REVIEW_STATUSES),
  reply: z.string().trim().max(2000).nullish(),
});
const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  reference: z.string().trim().min(1).max(160).optional(),
  productSlug: z.string().trim().min(1).max(160).optional(),
  rating: z.int().min(MIN_RATING).max(MAX_RATING).optional(),
  title: z.string().trim().max(160).nullish(),
  body: z.string().trim().max(2000).nullish(),
  reviewerName: z.string().trim().max(160).nullish(),
  reviewerRole: z.string().trim().max(160).nullish(),
  reviewerEmail: z.string().trim().max(160).nullish(),
  status: z.enum(REVIEW_STATUSES).optional(),
  reply: z.string().trim().max(2000).nullish(),
});

const toInput = <T>(body: T) => body;

/** Product reviews API (generated). Writes go through the maker–checker gate. */
@ApiTags('Product reviews')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'product-reviews', version: '1' })
export class ProductReviewsController extends BaseController {
  constructor(
    private readonly listProductReviews: ListProductReviewsUseCase,
    private readonly getProductReview: GetProductReviewUseCase,
    private readonly createProductReview: CreateProductReviewUseCase,
    private readonly updateProductReview: UpdateProductReviewUseCase,
    private readonly deleteProductReview: DeleteProductReviewUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('product-reviews:read')
  @ApiOperation({ summary: 'List product reviews (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Product reviews', ProductReviewDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<ProductReviewDto[]>> {
    return this.paginated(await this.listProductReviews.execute(request), toDto);
  }

  @Get(':id')
  @RequirePermissions('product-reviews:read')
  @ApiOperation({ summary: 'Get a product review' })
  @ApiEnvelope(200, 'Product review', ProductReviewDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<ProductReviewDto>> {
    return this.ok(toDto(await this.getProductReview.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('product-reviews:create')
  @Audit({
    action: 'PRODUCT_REVIEWS_CREATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductReview',
  })
  @ApiOperation({ summary: 'Create a product review; 202 when it needs approval' })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', ProductReviewDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductReviewDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-reviews.create',
      principal,
      payload: body,
      comment: reason,
      execute: () => this.createProductReview.execute({ ...input, principal }),
    });
    return this.gated(outcome, toDto, 'Product review created.');
  }

  @Patch(':id')
  @RequirePermissions('product-reviews:update')
  @Audit({
    action: 'PRODUCT_REVIEWS_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductReview',
  })
  @ApiOperation({
    summary: 'Update a product review (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', ProductReviewDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductReviewDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-reviews.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () => this.updateProductReview.execute({ ...input, id, principal }),
    });
    return this.gated(outcome, toDto, 'Product review updated.');
  }

  @Delete(':id')
  @RequirePermissions('product-reviews:delete')
  @Audit({
    action: 'PRODUCT_REVIEWS_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductReview',
  })
  @ApiOperation({ summary: 'Delete a product review; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', ProductReviewDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductReviewDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-reviews.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteProductReview.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Product review deleted.');
  }
}

// ── Website: a product's rating and reviews ─────────────────────────────────

const TEN_MINUTES = 600_000;
const slugParam = z.string().regex(/^[a-z0-9-]{1,160}$/);

export const PublicReviewDto = apiSchema(
  'PublicProductReview',
  z.object({
    reference: z.string(),
    rating: z.int(),
    title: z.string().nullable(),
    /** Null for a star rating only. */
    body: z.string().nullable(),
    /** Name as the reviewer gave it (never the e-mail); null when not given. */
    reviewerName: z.string().nullable(),
    reviewerRole: z.string().nullable(),
    /** Public reply from the team. */
    reply: z.string().nullable(),
    createdAt: isoDateTime(),
  }),
);
type PublicReview = ApiDto<typeof PublicReviewDto>;

export const RatingSummaryDto = apiSchema(
  'ProductRatingSummary',
  z.object({
    average: z.number(),
    count: z.int(),
    /** Reviews per star rating: index 0 = 1 star … index 4 = 5 stars. */
    distribution: z.array(z.int()).length(5),
  }),
);

export const PublicReviewsDto = apiSchema(
  'PublicProductReviews',
  z.object({
    summary: RatingSummaryDto.zod.nullable(),
    reviews: z.array(PublicReviewDto.zod),
  }),
);
type PublicReviews = ApiDto<typeof PublicReviewsDto>;

export const toPublicReview = (e: ProductReview): PublicReview => ({
  reference: e.reference,
  rating: e.rating,
  title: e.title,
  body: e.body,
  reviewerName: e.reviewerName,
  reviewerRole: e.reviewerRole,
  reply: e.reply,
  createdAt: e.createdAt.toISOString(),
});

const PublicReviewsQuery = z.object({
  rating: z.coerce.number().int().min(MIN_RATING).max(MAX_RATING).optional(),
});

const SubmitReviewSchema = z.strictObject({
  rating: z.int().min(MIN_RATING).max(MAX_RATING),
  title: z.string().trim().max(160).nullish(),
  body: z.string().trim().max(2000).nullish(),
  reviewerName: z.string().trim().max(120).nullish(),
  reviewerRole: z.string().trim().max(160).nullish(),
  reviewerEmail: z.string().trim().max(160).nullish(),
  meta: z.object({ honeypot: z.string().max(200), elapsedMs: z.int().min(0).max(86_400_000) }),
});

export const ReviewSubmittedDto = apiSchema('ReviewSubmitted', z.object({ reference: z.string() }));

/**
 * Customer ratings on the website. Anyone may rate a published product, with
 * stars alone or with a written review; it appears (and counts) only after
 * staff approve it. Rate limited per
 * visitor IP, which is only stored as a keyed hash; e-mails are never public.
 */
@ApiTags('Marketplace (public)')
@ApiStandardErrors()
@Public()
@Controller({ path: 'marketplace/products/:slug/reviews', version: '1' })
export class PublicProductReviewsController extends BaseController {
  constructor(
    private readonly publicReviews: PublicProductReviewsUseCase,
    private readonly submitReview: SubmitProductReviewUseCase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  @Get()
  @ApiOperation({ summary: "A product's rating and its approved reviews (newest first)" })
  @ApiEnvelope(200, 'Reviews', PublicReviewsDto)
  async list(
    @Param('slug', zod(slugParam)) slug: string,
    @Query(zod(PublicReviewsQuery)) query: z.infer<typeof PublicReviewsQuery>,
  ): Promise<ApiResult<PublicReviews>> {
    const { summary, reviews } = await this.publicReviews.execute(slug, query.rating);
    return this.ok({ summary, reviews: reviews.map(toPublicReview) });
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: TEN_MINUTES } })
  @Audit({
    action: 'PRODUCT_REVIEW_SUBMITTED',
    category: 'DATA_CHANGE',
    resourceType: 'ProductReview',
  })
  @ApiOperation({ summary: 'Rate a product (shown after staff approval)' })
  @ApiZodBody(SubmitReviewSchema)
  @ApiEnvelope(201, 'Received', ReviewSubmittedDto)
  async submit(
    @Param('slug', zod(slugParam)) slug: string,
    @Body(zod(SubmitReviewSchema)) body: z.infer<typeof SubmitReviewSchema>,
  ): Promise<ApiResult<{ reference: string }>> {
    assertHuman(body.meta);
    const { meta: _meta, ...input } = body;
    const ip = RequestContext.get()?.ipAddress ?? 'unknown';
    const review = await this.submitReview.execute({
      ...input,
      productSlug: slug,
      ipHash: visitorHash(this.config.marketplace.privacySalt, `ip:${ip}`),
    });
    return this.ok({ reference: review.reference }, 'Thank you! We will check your review.');
  }
}
