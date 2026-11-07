import { defineResource } from '@/shared/data/resource';
import type { ProductIdea } from './types';

/** Product ideas: one definition for query keys, hooks, BFF routes and server prefetch. */
export const productIdeasResource = defineResource<ProductIdea>({
  name: 'product-ideas',
  apiPath: '/api/product-ideas',
  backendPath: '/product-ideas',
  listDefaults: { pageSize: 20, sort: [{ field: 'createdAt', direction: 'desc' }] },
});
