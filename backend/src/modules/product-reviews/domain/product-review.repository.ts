import type { Repository } from '#core/domain/repository.js';
import type { ProductReview } from './product-review.entity.js';

/** Approved-review statistics of one product. */
export interface RatingSummary {
  /** Average stars, rounded to one decimal. */
  average: number;
  count: number;
  /** Number of reviews per star rating, index 0 = 1 star … index 4 = 5 stars. */
  distribution: [number, number, number, number, number];
}

export interface ProductReviewRepository extends Repository<ProductReview> {
  /** Unique fields (deleted records included: values are never reused). */
  findByUnique(field: 'reference', value: string | number): Promise<ProductReview | null>;
  /** Rating summaries of every product with at least one approved review, by product slug. */
  summaries(): Promise<Map<string, RatingSummary>>;
  /** Per product, the newest approved review with at least `minRating` stars (featured on cards). */
  featured(minRating: number): Promise<Map<string, ProductReview>>;
  /** Approved reviews of one product, newest first. */
  findApproved(
    productSlug: string,
    options: { rating?: number; limit: number },
  ): Promise<ProductReview[]>;
  /** Reviews sent from one network since a moment (rate limits). */
  countRecentFromIp(ipHash: string, since: Date): Promise<number>;
  /** Whether this e-mail already reviewed the product (pending or approved). */
  existsFor(productSlug: string, reviewerEmail: string): Promise<boolean>;
}

export const PRODUCT_REVIEW_REPOSITORY = Symbol('ProductReviewRepository');
