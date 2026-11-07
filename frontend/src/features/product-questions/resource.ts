import { defineResource } from '@/shared/data/resource';
import type { ProductQuestion } from './types';

/** Product questions: one definition for query keys, hooks, BFF routes and server prefetch. */
export const productQuestionsResource = defineResource<ProductQuestion>({
  name: 'product-questions',
  apiPath: '/api/product-questions',
  backendPath: '/product-questions',
  listDefaults: { pageSize: 20, sort: [{ field: 'lastMessageAt', direction: 'desc' }] },
});
