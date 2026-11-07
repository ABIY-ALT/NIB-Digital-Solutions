import { z } from 'zod';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { productCategoriesResource } from '../resource';
import type { ProductCategory } from '../types';

/**
 * Product categories BFF routes → NestJS /product-categories. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const createBody = z.object({
  code: z.string().trim().max(160),
  name: z.string().trim().max(160),
  description: z.string().trim().max(2000).nullish(),
  icon: z.string().trim().max(160).nullish(),
  sortOrder: z.number().int().nullish(),
});
const updateBody = z.object({
  version: z.number().int().min(1),
  code: z.string().trim().max(160).nullish(),
  name: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(2000).nullish(),
  icon: z.string().trim().max(160).nullish(),
  sortOrder: z.number().int().nullish(),
});

export const { list, get, create, update, remove } = resourceRoutes<ProductCategory>(
  productCategoriesResource,
  {
    access: {
      read: 'product-categories:read',
      create: 'product-categories:create',
      update: 'product-categories:update',
      delete: 'product-categories:delete',
    },
    schemas: { create: createBody, update: updateBody },
  },
);

export const exportRoute = resourceExportRoute<ProductCategory>(productCategoriesResource, {
  access: 'product-categories:read',
  fileName: 'product-categories',
  columns: [
    { id: 'code', header: 'productCategories.fields.code', value: (e) => e.code },
    { id: 'name', header: 'productCategories.fields.name', value: (e) => e.name },
    { id: 'icon', header: 'productCategories.fields.icon', value: (e) => e.icon },
    { id: 'sortOrder', header: 'productCategories.fields.sortOrder', value: (e) => e.sortOrder },
    { id: 'updatedAt', header: 'productCategories.columns.updated', value: (e) => e.updatedAt },
  ],
});
