import { defineResource } from '@/shared/data/resource';
import type { ProductReview } from './types';

/** Product reviews: one definition for query keys, hooks, BFF routes and server prefetch. */
export const productReviewsResource = defineResource<ProductReview>({
  name: 'product-reviews',
  apiPath: '/api/product-reviews',
  backendPath: '/product-reviews',
  // Newest first: the moderation queue.
  listDefaults: { pageSize: 20, sort: [{ field: 'createdAt', direction: 'desc' }] },
});
