import { defineResource } from '@/shared/data/resource';
import type { DigitalProduct } from './types';

/** Digital products: one definition for query keys, hooks, BFF routes and server prefetch. */
export const digitalProductsResource = defineResource<DigitalProduct>({
  name: 'digital-products',
  apiPath: '/api/digital-products',
  backendPath: '/digital-products',
  listDefaults: { pageSize: 20, sort: [{ field: 'slug', direction: 'asc' }] },
});
