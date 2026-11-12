import { describe, expect, it } from 'vitest';
import { ValidationError } from '#core/domain/errors/app-error.js';
import { ProductReview, type ProductReviewInput } from './product-review.entity.js';

const valid = (overrides: Partial<ProductReviewInput> = {}): ProductReviewInput => ({
  reference: 'REV-261107-ABCDE',
  productSlug: 'school-management-system',
  rating: 5,
  title: 'Fee collection in a day',
  body: 'Parents pay from their phones and every payment lands in the right account.',
  reviewerName: 'Selam',
  reviewerRole: 'Finance Head, private school',
  reviewerEmail: ' Selam@Example.org ',
  status: 'pending',
  reply: null,
  ipHash: 'abc',
  ...overrides,
});

const fieldsOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return (e.details as { field: string }[]).map((d) => d.field);
    throw e;
  }
  return [];
};

describe('ProductReview', () => {
  it('creates a review waiting for approval, with a normalised e-mail', () => {
    const review = ProductReview.create(valid(), null);
    expect(review.status).toBe('pending');
    expect(review.isPublic).toBe(false);
    expect(review.reviewerEmail).toBe('selam@example.org');
    expect(review.ipHash).toBe('abc');
  });

  it('accepts 1 to 5 whole stars only', () => {
    expect(fieldsOf(() => ProductReview.create(valid({ rating: 0 }), null))).toContain('rating');
    expect(fieldsOf(() => ProductReview.create(valid({ rating: 6 }), null))).toContain('rating');
    expect(fieldsOf(() => ProductReview.create(valid({ rating: 4.5 }), null))).toContain('rating');
    expect(ProductReview.create(valid({ rating: 1 }), null).rating).toBe(1);
  });

  it('accepts a star rating alone: review, name and e-mail are optional', () => {
    const review = ProductReview.create(
      valid({ body: ' ', reviewerName: '', reviewerRole: null, reviewerEmail: '' }),
      null,
    );
    expect(review.rating).toBe(5);
    expect(review.body).toBeNull();
    expect(review.reviewerName).toBeNull();
    expect(review.reviewerEmail).toBeNull();
  });

  it('still checks an e-mail that is given, and the status', () => {
    const fields = fieldsOf(() =>
      ProductReview.create(valid({ reviewerEmail: 'not-an-email', status: 'live' }), null),
    );
    expect(fields).toEqual(['reviewerEmail', 'status']);
  });

  it('is public once approved; staff changes keep the IP hash', () => {
    const review = ProductReview.create(valid(), null);
    review.update({ status: 'approved', reply: 'Thank you!' }, 'staff-1');
    expect(review.isPublic).toBe(true);
    expect(review.reply).toBe('Thank you!');
    expect(review.ipHash).toBe('abc');
  });
});
