import { z } from 'zod';
import { apiSchema, isoDateTime, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import type { DigitalProduct } from '#modules/digital-products/domain/digital-product.entity.js';
import {
  contentOf,
  ProductContentSchema,
} from '#modules/digital-products/presentation/product-content.schema.js';
import type { ProductCategory } from '#modules/product-categories/domain/product-category.entity.js';
import type { ProductReview } from '#modules/product-reviews/domain/product-review.entity.js';
import type { RatingSummary } from '#modules/product-reviews/domain/product-review.repository.js';
import { AssistantReplySchema } from '../application/assistant.service.js';
import {
  AVAILABILITIES,
  CONTACT_METHODS,
  DEMO_TYPES,
  DEPLOYMENTS,
  INQUIRY_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PLATFORMS,
} from '../domain/marketplace.constants.js';

// ── Public catalog (no internal documentation, no bookkeeping) ──────────────

export const PublicProductDto = apiSchema(
  'MarketplaceProduct',
  z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    tagline: z.string(),
    summary: z.string(),
    overview: z.string(),
    problem: z.string(),
    categoryCode: z.string(),
    availability: z.enum(AVAILABILITIES),
    featured: z.boolean(),
    customizable: z.boolean(),
    icon: z.string(),
    accent: z.string(),
    /** Lower-case codes of MarketplaceCatalog.industries / .needs. */
    industries: z.array(z.string()),
    needs: z.array(z.string()),
    deployment: z.array(z.enum(DEPLOYMENTS)),
    platforms: z.array(z.enum(PLATFORMS)),
    keyFeatures: z.array(z.string()),
    content: ProductContentSchema.zod,
    /** Expected release (YYYY-MM-DD) of an upcoming product, when announced. */
    releaseDate: z.iso.date().nullable(),
    /** True when visitors can ask the product's developer (a developer is assigned and support is not paused). Developer identities are never public. */
    askDeveloper: z.boolean(),
    /** Customer rating from approved reviews; null until the first one is approved. */
    rating: z.object({ average: z.number(), count: z.int() }).nullable(),
    /** The newest approved review with at least 4 stars (shown on product cards). */
    featuredReview: z
      .object({
        rating: z.int(),
        title: z.string().nullable(),
        body: z.string(),
        reviewerName: z.string(),
        reviewerRole: z.string().nullable(),
      })
      .nullable(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
  }),
);
export type PublicProduct = ApiDto<typeof PublicProductDto>;

/** Ratings of every product (approved reviews only), by product slug. */
export interface CatalogRatings {
  summaries: Map<string, RatingSummary>;
  featured: Map<string, ProductReview>;
}

const NO_RATINGS: CatalogRatings = { summaries: new Map(), featured: new Map() };

export const toPublicProduct = (
  p: DigitalProduct,
  ratings: CatalogRatings = NO_RATINGS,
): PublicProduct => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  tagline: p.tagline ?? '',
  summary: p.summary,
  overview: p.overview ?? '',
  problem: p.problem ?? '',
  categoryCode: p.categoryCode,
  availability: p.availability as PublicProduct['availability'],
  featured: p.featured,
  customizable: p.customizable,
  icon: p.icon ?? 'Package',
  accent: p.accent ?? '#8B4E20',
  industries: p.industries,
  needs: p.needs,
  deployment: p.deployment as PublicProduct['deployment'],
  platforms: p.platforms as PublicProduct['platforms'],
  keyFeatures: p.keyFeatures,
  content: contentOf(p),
  releaseDate: p.releaseDate,
  askDeveloper: !!p.developerId && p.supportStatus !== 'paused',
  rating: ratingOf(ratings, p.slug),
  featuredReview: featuredReviewOf(ratings, p.slug),
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

function ratingOf(ratings: CatalogRatings, slug: string): PublicProduct['rating'] {
  const summary = ratings.summaries.get(slug);
  return summary ? { average: summary.average, count: summary.count } : null;
}

function featuredReviewOf(ratings: CatalogRatings, slug: string): PublicProduct['featuredReview'] {
  const review = ratings.featured.get(slug);
  return review
    ? {
        rating: review.rating,
        title: review.title,
        body: review.body,
        reviewerName: review.reviewerName,
        reviewerRole: review.reviewerRole,
      }
    : null;
}

export const PublicCategoryDto = apiSchema(
  'MarketplaceCategory',
  z.object({
    code: z.string(),
    name: z.string(),
    description: z.string(),
    icon: z.string(),
    sortOrder: z.int(),
  }),
);
export type PublicCategory = ApiDto<typeof PublicCategoryDto>;

export const toPublicCategory = (c: ProductCategory): PublicCategory => ({
  code: c.code,
  name: c.name,
  description: c.description ?? '',
  icon: c.icon ?? 'Package',
  sortOrder: c.sortOrder ?? 0,
});

export const TaxonomyEntryDto = apiSchema(
  'MarketplaceTaxonomyEntry',
  z.object({
    /** Lower-case code, as on products and in URLs (?industry=education). */
    id: z.string(),
    name: z.string(),
    short: z.string(),
    description: z.string(),
    icon: z.string(),
    keywords: z.array(z.string()),
  }),
);
export type PublicTaxonomyEntry = ApiDto<typeof TaxonomyEntryDto>;

export const CatalogDto = apiSchema(
  'MarketplaceCatalog',
  z.object({
    products: z.array(PublicProductDto.zod),
    categories: z.array(PublicCategoryDto.zod),
    /** Managed reference data (Administration › Reference data), in the requested language. */
    industries: z.array(TaxonomyEntryDto.zod),
    needs: z.array(TaxonomyEntryDto.zod),
  }),
);

// ── Submissions from the website ────────────────────────────────────────────

/** Anti-spam signals from the form: honeypot field value and time to fill. */
const Meta = z.object({ honeypot: z.string().max(200), elapsedMs: z.int().min(0).max(86_400_000) });
const isoDay = z.iso.date();

export const DemoSubmissionSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(120),
  organization: z.string().trim().min(2).max(160),
  jobTitle: z.string().trim().min(2).max(120),
  email: z.string().trim().max(160),
  phone: z.string().trim().max(40),
  productSlug: z.string().trim().min(1).max(80),
  demoType: z.enum(DEMO_TYPES),
  preferredDate: isoDay.nullish(),
  preferredTime: z.string().trim().max(5).nullish(),
  requirements: z.string().max(2000).nullish(),
  consent: z.literal(true),
  source: z.enum(LEAD_SOURCES).nullish(),
  meta: Meta,
});

export const InquirySubmissionSchema = z.strictObject({
  customerName: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).nullish(),
  email: z.string().trim().max(160),
  phone: z.string().trim().max(40).nullish(),
  productSlug: z.string().trim().max(80).nullish(),
  inquiryType: z.enum(INQUIRY_TYPES),
  message: z.string().min(10).max(2000),
  requirements: z.string().max(2000).nullish(),
  contactMethod: z.enum(CONTACT_METHODS),
  consent: z.literal(true),
  source: z.enum(LEAD_SOURCES).nullish(),
  meta: Meta,
});

export const SubmissionResultDto = apiSchema(
  'MarketplaceSubmissionResult',
  z.object({ reference: z.string() }),
);

export const EventSchema = z.strictObject({
  type: z.enum(['product_view', 'demo_play', 'assistant_query']),
  productSlug: z.string().trim().max(80).nullish(),
});

export const AssistantQuestionSchema = z.strictObject({
  question: z.string().trim().min(2).max(600),
  focusSlug: z.string().trim().max(80).nullish(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(16)
    .default([]),
});

export const AssistantReplyDto = apiSchema('MarketplaceAssistantReply', AssistantReplySchema);

// ── Media ───────────────────────────────────────────────────────────────────

export const MediaUploadSchema = z.strictObject({ data: z.string().min(1).max(30_000_000) });
export const StoredMediaDto = apiSchema(
  'MarketplaceMedia',
  z.object({ id: z.uuid(), url: z.string(), contentType: z.string(), size: z.int() }),
);
export const MediaContentDto = apiSchema(
  'MarketplaceMediaContent',
  z.object({ contentType: z.string(), data: z.string(), checksum: z.string() }),
);

// ── Analytics ───────────────────────────────────────────────────────────────

const Ranked = z.array(z.object({ slug: z.string(), count: z.int() }));
export const AnalyticsDto = apiSchema(
  'MarketplaceAnalytics',
  z.object({
    days: z.int(),
    totalProducts: z.int(),
    publishedProducts: z.int(),
    productViews: z.int(),
    demoPlays: z.int(),
    assistantQueries: z.int(),
    demoRequests: z.int(),
    inquiries: z.int(),
    daily: z.array(z.object({ date: z.string(), views: z.int(), leads: z.int() })),
    topViewed: Ranked,
    topWatched: Ranked,
    topRequested: Ranked,
    leadsByStatus: z.object(
      Object.fromEntries(LEAD_STATUSES.map((s) => [s, z.int()])) as Record<
        (typeof LEAD_STATUSES)[number],
        z.ZodInt
      >,
    ),
    leadsBySource: z.array(z.object({ source: z.string(), count: z.int() })),
    leadsByIndustry: z.array(z.object({ industry: z.string(), count: z.int() })),
    openByOwner: z.array(z.object({ ownerId: z.string().nullable(), count: z.int() })),
  }),
);
