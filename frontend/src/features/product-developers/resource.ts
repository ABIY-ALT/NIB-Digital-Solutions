import { defineResource } from '@/shared/data/resource';
import type { ProductDeveloper } from './types';

/** Product developers: one definition for query keys, hooks, BFF routes and server prefetch. */
export const productDevelopersResource = defineResource<ProductDeveloper>({
  name: 'product-developers',
  apiPath: '/api/product-developers',
  backendPath: '/product-developers',
  listDefaults: { pageSize: 20, sort: [{ field: 'name', direction: 'asc' }] },
});
