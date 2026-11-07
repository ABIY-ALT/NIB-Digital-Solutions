import { describe, expect, it, vi } from 'vitest';
import type { TransactionManager } from '#core/application/ports/transaction.port.js';
import type { DigitalProductRepository } from '#modules/digital-products/domain/digital-product.repository.js';
import type { ProductReview } from '../domain/product-review.entity.js';
import type { ProductReviewRepository } from '../domain/product-review.repository.js';
import {
  MAX_REVIEWS_PER_NETWORK_PER_DAY,
  PublicProductReviewsUseCase,
  SubmitProductReviewUseCase,
} from './product-review.use-cases.js';

const tx = { run: (fn: () => unknown) => fn() } as unknown as TransactionManager;

function setup({
  published = true,
  recent = 0,
  exists = false,
}: { published?: boolean; recent?: number; exists?: boolean } = {}) {
  const saved: ProductReview[] = [];
  const repo = {
    countRecentFromIp: vi.fn(() => Promise.resolve(recent)),
    existsFor: vi.fn(() => Promise.resolve(exists)),
    save: vi.fn((r: ProductReview) => {
      saved.push(r);
      return Promise.resolve(r);
    }),
    summaries: vi.fn(() =>
      Promise.resolve(
        new Map([['school', { average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] }]]),
      ),
    ),
    findApproved: vi.fn(() => Promise.resolve([])),
  } as unknown as ProductReviewRepository;
  const products = {
    findPublishedBySlug: vi.fn((slug: string) => Promise.resolve(published ? { slug } : null)),
  } as unknown as DigitalProductRepository;
  return { repo, products, saved };
}

const input = {
  productSlug: 'school',
  rating: 5,
  title: null,
  body: 'Fee collection closes the same day now.',
  reviewerName: 'Selam',
  reviewerRole: null,
  reviewerEmail: 'selam@example.org',
  ipHash: 'ip-hash',
};

describe('SubmitProductReviewUseCase', () => {
  it('saves a website review as pending, with a REV reference and the IP hash', async () => {
    const { repo, products, saved } = setup();
    const review = await new SubmitProductReviewUseCase(repo, products, tx).execute(input);
    expect(review.status).toBe('pending');
    expect(review.reference).toMatch(/^REV-\d{6}-[A-Z0-9]{5}$/);
    expect(review.ipHash).toBe('ip-hash');
    expect(saved).toHaveLength(1);
  });

  it('only accepts reviews of published products', async () => {
    const { repo, products } = setup({ published: false });
    await expect(
      new SubmitProductReviewUseCase(repo, products, tx).execute(input),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('accepts one review per e-mail and product', async () => {
    const { repo, products, saved } = setup({ exists: true });
    await expect(
      new SubmitProductReviewUseCase(repo, products, tx).execute(input),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(saved).toHaveLength(0);
  });

  it('limits reviews per network and day', async () => {
    const { repo, products, saved } = setup({ recent: MAX_REVIEWS_PER_NETWORK_PER_DAY });
    await expect(
      new SubmitProductReviewUseCase(repo, products, tx).execute(input),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(saved).toHaveLength(0);
  });
});

describe('PublicProductReviewsUseCase', () => {
  it("returns the product's rating summary and approved reviews", async () => {
    const { repo, products } = setup();
    const result = await new PublicProductReviewsUseCase(repo, products).execute('school', 5);
    expect(result.summary).toEqual({ average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] });
    expect(repo.findApproved).toHaveBeenCalledWith('school', { rating: 5, limit: 20 });
  });

  it('does not reveal reviews of unpublished products', async () => {
    const { repo, products } = setup({ published: false });
    await expect(
      new PublicProductReviewsUseCase(repo, products).execute('draft-product'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
