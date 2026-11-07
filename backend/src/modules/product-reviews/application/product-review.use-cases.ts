import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import {
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import {
  DIGITAL_PRODUCT_REPOSITORY,
  type DigitalProductRepository,
} from '#modules/digital-products/domain/digital-product.repository.js';
import { makeReference } from '#modules/marketplace/domain/lead-rules.js';
import { ProductReview, type ProductReviewInput } from '../domain/product-review.entity.js';
import {
  PRODUCT_REVIEW_REPOSITORY,
  type ProductReviewRepository,
  type RatingSummary,
} from '../domain/product-review.repository.js';

const DAY = 86_400_000;
/** Reviews accepted from one network per day (all products together). */
export const MAX_REVIEWS_PER_NETWORK_PER_DAY = 5;
/** Approved reviews shown on a product page at once. */
export const PUBLIC_REVIEWS_LIMIT = 20;
/** Reviews featured on product cards have at least this many stars. */
export const FEATURED_MIN_RATING = 4;

/** Product reviews: one use case per operation (generated). */

@Injectable()
export class ListProductReviewsUseCase implements UseCase<PageRequest, Page<ProductReview>> {
  constructor(@Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository) {}

  execute(request: PageRequest): Promise<Page<ProductReview>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetProductReviewUseCase implements UseCase<string, ProductReview> {
  constructor(@Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository) {}

  execute(id: string): Promise<ProductReview> {
    return this.repo.getById(id);
  }
}

export interface CreateProductReviewCommand extends Omit<
  ProductReviewInput,
  'reference' | 'ipHash'
> {
  /** Generated when empty. */
  reference?: string;
  principal: Principal;
}

@Injectable()
export class CreateProductReviewUseCase implements UseCase<
  CreateProductReviewCommand,
  ProductReview
> {
  constructor(
    @Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Validates without saving (used by the maker–checker preview). */
  async draft({
    principal,
    reference,
    ...rest
  }: CreateProductReviewCommand): Promise<ProductReview> {
    // Reviews staff record themselves (e.g. collected at a meeting) get a reference like website ones.
    const input: ProductReviewInput = {
      ...rest,
      reference: reference?.trim() || makeReference('REV'),
      ipHash: null,
    };
    const other = await this.repo.findByUnique('reference', input.reference);
    if (other) throw new ConflictError('Reference is already used.', { field: 'reference' });
    return ProductReview.create(input, principal.userId);
  }

  execute(command: CreateProductReviewCommand): Promise<ProductReview> {
    return this.tx.run(async () => this.repo.save(await this.draft(command)));
  }
}

export interface UpdateProductReviewCommand extends Partial<ProductReviewInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateProductReviewUseCase implements UseCase<
  UpdateProductReviewCommand,
  ProductReview
> {
  constructor(
    @Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply({
    principal,
    id,
    version,
    ...input
  }: UpdateProductReviewCommand): Promise<ProductReview> {
    const entity = await this.repo.getById(id);
    if (!entity.assertVersion(version)) throw new ConcurrencyError('ProductReview', id, version);
    if (input.reference !== undefined && input.reference !== null) {
      const other = await this.repo.findByUnique('reference', input.reference);
      if (other && other.id !== id) {
        throw new ConflictError('Reference is already used.', { field: 'reference' });
      }
    }
    entity.update(input, principal.userId);
    return entity;
  }

  execute(command: UpdateProductReviewCommand): Promise<ProductReview> {
    return this.tx.run(async () => this.repo.update(await this.apply(command)));
  }
}

@Injectable()
export class DeleteProductReviewUseCase implements UseCase<
  { principal: Principal; id: string },
  ProductReview
> {
  constructor(@Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<ProductReview> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}

// ── Website ─────────────────────────────────────────────────────────────────

export interface SubmitReviewCommand {
  productSlug: string;
  rating: number;
  title?: string | null;
  body: string;
  reviewerName: string;
  reviewerRole?: string | null;
  reviewerEmail: string;
  /** Salted hash of the visitor's IP. */
  ipHash: string;
}

/**
 * A visitor rates a published product. The review waits for staff approval
 * before it appears or counts. Limited per network and to one review per
 * e-mail and product.
 */
@Injectable()
export class SubmitProductReviewUseCase implements UseCase<SubmitReviewCommand, ProductReview> {
  constructor(
    @Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository,
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly products: DigitalProductRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  async execute({ ipHash, ...input }: SubmitReviewCommand): Promise<ProductReview> {
    if (!(await this.products.findPublishedBySlug(input.productSlug)))
      throw new NotFoundError('Product', input.productSlug);
    const review = ProductReview.create(
      { ...input, reference: makeReference('REV'), status: 'pending', reply: null, ipHash },
      null,
    );
    const recent = await this.repo.countRecentFromIp(ipHash, new Date(Date.now() - DAY));
    if (recent >= MAX_REVIEWS_PER_NETWORK_PER_DAY) throw new RateLimitError(DAY / 1000);
    if (await this.repo.existsFor(review.productSlug, review.reviewerEmail))
      throw new ConflictError('You have already reviewed this product.', {
        field: 'reviewerEmail',
      });
    return this.tx.run(() => this.repo.save(review));
  }
}

/** A product's public rating and its approved reviews (newest first). */
@Injectable()
export class PublicProductReviewsUseCase {
  constructor(
    @Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository,
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly products: DigitalProductRepository,
  ) {}

  async execute(
    productSlug: string,
    rating?: number,
  ): Promise<{ summary: RatingSummary | null; reviews: ProductReview[] }> {
    if (!(await this.products.findPublishedBySlug(productSlug)))
      throw new NotFoundError('Product', productSlug);
    const [summaries, reviews] = await Promise.all([
      this.repo.summaries(),
      this.repo.findApproved(productSlug, { rating, limit: PUBLIC_REVIEWS_LIMIT }),
    ]);
    return { summary: summaries.get(productSlug) ?? null, reviews };
  }
}

/** Ratings and featured reviews of every product (for the public catalog). */
@Injectable()
export class ProductRatingsService {
  constructor(@Inject(PRODUCT_REVIEW_REPOSITORY) private readonly repo: ProductReviewRepository) {}

  async all(): Promise<{
    summaries: Map<string, RatingSummary>;
    featured: Map<string, ProductReview>;
  }> {
    const [summaries, featured] = await Promise.all([
      this.repo.summaries(),
      this.repo.featured(FEATURED_MIN_RATING),
    ]);
    return { summaries, featured };
  }
}
