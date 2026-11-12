import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import { ValidationError, type FieldIssue } from '#core/domain/errors/app-error.js';

/** pending: new, waiting for a decision · approved: on the website · rejected: never shown. */
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface ProductReviewProps {
  reference: string;
  productSlug: string;
  rating: number;
  title: string | null;
  /** Written review; null for a star rating only. */
  body: string | null;
  reviewerName: string | null;
  reviewerRole: string | null;
  reviewerEmail: string | null;
  status: string;
  reply: string | null;
  /** Salted hash of the reviewer's IP (website reviews only). */
  ipHash: string | null;
}

export interface ProductReviewInput {
  reference: string;
  productSlug: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  reviewerName?: string | null;
  reviewerRole?: string | null;
  reviewerEmail?: string | null;
  status: string;
  reply?: string | null;
  ipHash?: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A customer's rating (1–5 stars) and review of a product. Only the rating is
 * required: the written review, the reviewer's name, role and e-mail are
 * optional (a valid address when given). Reviews from the website start as pending; staff approve or reject them and may reply. Only
 * approved reviews are public and count towards a product's rating.
 */
export class ProductReview extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private props: ProductReviewProps,
  ) {
    super(meta);
  }

  static create(input: ProductReviewInput, actorId: string | null): ProductReview {
    const entity = new ProductReview(
      BaseEntity.newMetadata(actorId),
      ProductReview.validate(input),
    );
    entity.addEvent('product-review.created', { id: entity.id });
    return entity;
  }

  static reconstitute(meta: EntityMetadata, props: ProductReviewProps): ProductReview {
    return new ProductReview(meta, props);
  }

  /** Normalises input and enforces field rules; throws VALIDATION_FAILED. */
  static validate(input: ProductReviewInput): ProductReviewProps {
    const issues: FieldIssue[] = [];
    const reference = (input.reference ?? '').trim();
    if (!reference) issues.push({ field: 'reference', message: 'Reference is required' });
    if (reference.length > 160)
      issues.push({ field: 'reference', message: 'At most 160 characters' });
    const productSlug = (input.productSlug ?? '').trim();
    if (!productSlug) issues.push({ field: 'productSlug', message: 'Product is required' });
    if (productSlug.length > 160)
      issues.push({ field: 'productSlug', message: 'At most 160 characters' });
    const rating = input.rating;
    if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING)
      issues.push({
        field: 'rating',
        message: `A whole number from ${MIN_RATING} to ${MAX_RATING}`,
      });
    const title = (input.title ?? '').trim();
    if (title.length > 160) issues.push({ field: 'title', message: 'At most 160 characters' });
    const body = (input.body ?? '').trim();
    if (body.length > 2000) issues.push({ field: 'body', message: 'At most 2000 characters' });
    const reviewerName = (input.reviewerName ?? '').trim();
    if (reviewerName.length > 160)
      issues.push({ field: 'reviewerName', message: 'At most 160 characters' });
    const reviewerRole = (input.reviewerRole ?? '').trim();
    if (reviewerRole.length > 160)
      issues.push({ field: 'reviewerRole', message: 'At most 160 characters' });
    const reviewerEmail = (input.reviewerEmail ?? '').trim().toLowerCase();
    if (reviewerEmail && (!EMAIL.test(reviewerEmail) || reviewerEmail.length > 160))
      issues.push({ field: 'reviewerEmail', message: 'Enter a valid e-mail address' });
    const status = (input.status ?? '').trim();
    if (!(REVIEW_STATUSES as readonly string[]).includes(status))
      issues.push({ field: 'status', message: `One of ${REVIEW_STATUSES.join(', ')}` });
    const reply = (input.reply ?? '').trim();
    if (reply.length > 2000) issues.push({ field: 'reply', message: 'At most 2000 characters' });
    if (issues.length) throw new ValidationError(issues);
    return {
      reference,
      productSlug,
      rating,
      title: title || null,
      body: body || null,
      reviewerName: reviewerName || null,
      reviewerRole: reviewerRole || null,
      reviewerEmail: reviewerEmail || null,
      status,
      reply: reply || null,
      ipHash: input.ipHash ?? null,
    };
  }

  get reference(): string {
    return this.props.reference;
  }
  get productSlug(): string {
    return this.props.productSlug;
  }
  get rating(): number {
    return this.props.rating;
  }
  get title(): string | null {
    return this.props.title;
  }
  get body(): string | null {
    return this.props.body;
  }
  get reviewerName(): string | null {
    return this.props.reviewerName;
  }
  get reviewerRole(): string | null {
    return this.props.reviewerRole;
  }
  get reviewerEmail(): string | null {
    return this.props.reviewerEmail;
  }
  get status(): string {
    return this.props.status;
  }
  get reply(): string | null {
    return this.props.reply;
  }
  get ipHash(): string | null {
    return this.props.ipHash;
  }
  /** Shown on the website and counted in the product's rating. */
  get isPublic(): boolean {
    return this.props.status === 'approved';
  }

  /** Staff changes; the reviewer's IP hash is never edited. */
  update(changes: Partial<Omit<ProductReviewInput, 'ipHash'>>, actorId: string | null): void {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    this.props = ProductReview.validate({ ...this.props, ...defined, ipHash: this.props.ipHash });
    this.touch(actorId);
  }

  toSnapshot(): Readonly<ProductReviewProps> {
    return { ...this.props };
  }
}
