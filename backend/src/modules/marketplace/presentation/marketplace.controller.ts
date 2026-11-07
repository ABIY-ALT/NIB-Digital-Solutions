import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Principal } from '#core/application/security/principal.js';
import { BadRequestError, ValidationError } from '#core/domain/errors/app-error.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit, Public } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '#modules/authorization/presentation/authorization.decorators.js';
import { SubmitDemoRequestUseCase } from '#modules/demo-requests/application/demo-request.use-cases.js';
import { SubmitProductInquiryUseCase } from '#modules/product-inquiries/application/product-inquiry.use-cases.js';
import {
  MarketplaceAnalyticsService,
  type MarketplaceAnalytics,
} from '../application/analytics.service.js';
import {
  MarketplaceAssistantService,
  type AssistantReply,
} from '../application/assistant.service.js';
import { CatalogService } from '../application/catalog.service.js';
import { ANALYTICS_PERIODS } from '../application/marketplace.ports.js';
import { MarketplaceMediaService, type StoredMedia } from '../application/media.service.js';
import { SLUG_PATTERN } from '../domain/marketplace.constants.js';
import {
  AnalyticsDto,
  AssistantQuestionSchema,
  AssistantReplyDto,
  CatalogDto,
  DemoSubmissionSchema,
  EventSchema,
  InquirySubmissionSchema,
  MediaContentDto,
  MediaUploadSchema,
  PublicProductDto,
  StoredMediaDto,
  SubmissionResultDto,
  toPublicCategory,
  toPublicProduct,
  type PublicProduct,
} from './marketplace.schemas.js';

/** Fastest a person fills the form; quicker submissions are treated as automated. */
const MIN_FILL_MS = 2500;
const TEN_MINUTES = 600_000;

function assertHuman(meta: { honeypot: string; elapsedMs: number }): void {
  if (meta.honeypot.trim() !== '' || meta.elapsedMs < MIN_FILL_MS) {
    throw new BadRequestError('We could not verify this submission. Please try again.', {
      reason: 'spam',
    });
  }
}

const slugParam = zod(z.string().regex(SLUG_PATTERN).max(80));

/** Reporting period of the analytics screen. */
const AnalyticsQuery = z.object({
  days: z.coerce
    .number()
    .pipe(z.union(ANALYTICS_PERIODS.map((d) => z.literal(d))))
    .default(30),
});

/** Language of the taxonomy names ("en", "am", …); default: the list's base labels. */
const CatalogQuery = z.object({
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional(),
});

/**
 * Public marketplace API for the NIB Digital Solutions website. No end-user
 * token is needed, but every call still carries the BFF service signature.
 * Submissions are validated, sanitised (in the entities), rate limited per
 * visitor IP, checked for spam and audited.
 */
@ApiTags('Marketplace (public)')
@ApiStandardErrors()
@Public()
@Controller({ path: 'marketplace', version: '1' })
export class MarketplaceController extends BaseController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly analytics: MarketplaceAnalyticsService,
    private readonly assistant: MarketplaceAssistantService,
    private readonly media: MarketplaceMediaService,
    private readonly submitDemo: SubmitDemoRequestUseCase,
    private readonly submitInquiry: SubmitProductInquiryUseCase,
  ) {
    super();
  }

  @Get('catalog')
  @ApiOperation({
    summary: 'Published products, categories, industries and business needs',
    description:
      'Industries and needs are managed reference data, translated when `locale` is given.',
  })
  @ApiEnvelope(200, 'Catalog', CatalogDto)
  async getCatalog(
    @Query(zod(CatalogQuery)) query: z.infer<typeof CatalogQuery>,
  ): Promise<ApiResult<z.infer<typeof CatalogDto.zod>>> {
    const { products, categories, industries, needs, ratings } = await this.catalog.catalog(
      query.locale,
    );
    return this.ok({
      products: products.map((p) => toPublicProduct(p, ratings)),
      categories: categories.map(toPublicCategory),
      industries,
      needs,
    });
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'A published product by slug' })
  @ApiEnvelope(200, 'Product', PublicProductDto)
  async getProduct(@Param('slug', slugParam) slug: string): Promise<ApiResult<PublicProduct>> {
    const { product, ratings } = await this.catalog.productWithRatings(slug);
    return this.ok(toPublicProduct(product, ratings));
  }

  @Post('demo-requests')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: TEN_MINUTES } })
  @Audit({
    action: 'MARKETPLACE_DEMO_REQUEST',
    category: 'DATA_CHANGE',
    resourceType: 'DemoRequest',
  })
  @ApiOperation({ summary: 'Submit a demo request from the website' })
  @ApiZodBody(DemoSubmissionSchema)
  @ApiEnvelope(201, 'Submitted', SubmissionResultDto)
  async demoRequest(
    @Body(zod(DemoSubmissionSchema)) body: z.infer<typeof DemoSubmissionSchema>,
  ): Promise<ApiResult<{ reference: string }>> {
    assertHuman(body.meta);
    if (!(await this.catalog.isPublished(body.productSlug))) {
      throw new ValidationError([{ field: 'productSlug', message: 'Choose a product' }]);
    }
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10); // Addis Ababa
    if (body.preferredDate && body.preferredDate < today) {
      throw new ValidationError([
        { field: 'preferredDate', message: 'Choose today or a future date' },
      ]);
    }
    const { meta: _meta, consent: _consent, preferredDate, ...input } = body;
    const saved = await this.submitDemo.execute({
      ...input,
      preferredDate: preferredDate ? new Date(`${preferredDate}T00:00:00.000Z`) : null,
      source: input.source ?? 'homepage',
    });
    await this.analytics.record('demo_request', saved.productSlug);
    return this.ok({ reference: saved.reference }, 'Demo request received.');
  }

  @Post('inquiries')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: TEN_MINUTES } })
  @Audit({ action: 'MARKETPLACE_INQUIRY', category: 'DATA_CHANGE', resourceType: 'ProductInquiry' })
  @ApiOperation({ summary: 'Submit a product inquiry from the website' })
  @ApiZodBody(InquirySubmissionSchema)
  @ApiEnvelope(201, 'Submitted', SubmissionResultDto)
  async inquiry(
    @Body(zod(InquirySubmissionSchema)) body: z.infer<typeof InquirySubmissionSchema>,
  ): Promise<ApiResult<{ reference: string }>> {
    assertHuman(body.meta);
    const productSlug =
      body.productSlug && (await this.catalog.isPublished(body.productSlug))
        ? body.productSlug
        : null;
    const { meta: _meta, consent: _consent, ...input } = body;
    const saved = await this.submitInquiry.execute({
      ...input,
      productSlug,
      source: input.source ?? 'contact_page',
    });
    await this.analytics.record('inquiry', saved.productSlug);
    return this.ok({ reference: saved.reference }, 'Inquiry received.');
  }

  @Post('events')
  @HttpCode(202)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a product view, demo play or assistant question' })
  @ApiZodBody(EventSchema)
  @ApiEnvelope(202, 'Recorded')
  async event(@Body(zod(EventSchema)) body: z.infer<typeof EventSchema>): Promise<ApiResult<null>> {
    const slug = body.productSlug && SLUG_PATTERN.test(body.productSlug) ? body.productSlug : null;
    await this.analytics.record(body.type, slug);
    return this.empty();
  }

  @Post('assistant')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @ApiOperation({ summary: 'Ask the grounded product assistant (503 when it is not configured)' })
  @ApiZodBody(AssistantQuestionSchema)
  @ApiEnvelope(200, 'Answer', AssistantReplyDto)
  async ask(
    @Body(zod(AssistantQuestionSchema)) body: z.infer<typeof AssistantQuestionSchema>,
  ): Promise<ApiResult<AssistantReply>> {
    const reply = await this.assistant.ask(body.question, body.focusSlug ?? null, body.history);
    await this.analytics.record('assistant_query', body.focusSlug ?? null);
    return this.ok(reply);
  }

  @Get('media/:id')
  @ApiOperation({ summary: 'An uploaded product image (base64; the BFF serves the bytes)' })
  @ApiEnvelope(200, 'Media', MediaContentDto)
  async getMedia(
    @Param('id', zod(z.uuid())) id: string,
  ): Promise<ApiResult<{ contentType: string; data: string; checksum: string }>> {
    return this.ok(await this.media.read(id));
  }
}

/** Staff side of the marketplace: analytics and product media uploads. */
@ApiTags('Marketplace (staff)')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'marketplace/admin', version: '1' })
export class MarketplaceAdminController extends BaseController {
  constructor(
    private readonly analytics: MarketplaceAnalyticsService,
    private readonly media: MarketplaceMediaService,
  ) {
    super();
  }

  @Get('analytics')
  @RequirePermissions('marketplace-analytics:read')
  @ApiOperation({
    summary: 'Catalog engagement and pipeline over a period (days: 7, 30, 90 or 365; default 30)',
  })
  @ApiEnvelope(200, 'Analytics', AnalyticsDto)
  async getAnalytics(
    @Query(zod(AnalyticsQuery)) query: z.infer<typeof AnalyticsQuery>,
  ): Promise<ApiResult<MarketplaceAnalytics>> {
    return this.ok(await this.analytics.summary(query.days));
  }

  @Post('media')
  @HttpCode(201)
  // Product editors (screenshots) and hero-carousel editors (slide images) upload here.
  @RequireAnyPermission('digital-products:update', 'hero-slides:create', 'hero-slides:update')
  @Audit({
    action: 'MARKETPLACE_MEDIA_UPLOAD',
    category: 'DATA_CHANGE',
    resourceType: 'MarketplaceMedia',
  })
  @ApiOperation({ summary: 'Upload a product or hero image (PNG, JPEG, WebP or AVIF; base64)' })
  @ApiZodBody(MediaUploadSchema)
  @ApiEnvelope(201, 'Uploaded', StoredMediaDto)
  async upload(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(MediaUploadSchema)) body: z.infer<typeof MediaUploadSchema>,
  ): Promise<ApiResult<StoredMedia>> {
    return this.ok(await this.media.upload(body.data, principal.userId), 'Image uploaded.');
  }
}
