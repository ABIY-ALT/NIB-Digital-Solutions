import { defineResource } from '@/shared/data/resource';
import type { ProductCategory } from './types';

/** Product categories: one definition for query keys, hooks, BFF routes and server prefetch. */
export const productCategoriesResource = defineResource<ProductCategory>({
  name: 'product-categories',
  apiPath: '/api/product-categories',
  backendPath: '/product-categories',
  listDefaults: { pageSize: 20, sort: [{ field: 'code', direction: 'asc' }] },
});
