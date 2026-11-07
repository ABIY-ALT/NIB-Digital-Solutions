import { defineResource } from '@/shared/data/resource';
import type { ProductInquiry } from './types';

/** Product inquiries: one definition for query keys, hooks, BFF routes and server prefetch. */
export const productInquiriesResource = defineResource<ProductInquiry>({
  name: 'product-inquiries',
  apiPath: '/api/product-inquiries',
  backendPath: '/product-inquiries',
  listDefaults: { pageSize: 20, sort: [{ field: 'reference', direction: 'asc' }] },
});
