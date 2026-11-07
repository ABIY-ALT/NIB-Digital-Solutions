import { z } from 'zod';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { productIdeasResource } from '../resource';
import { IDEA_STATUSES } from '../schemas';
import type { ProductIdea } from '../types';

/**
 * Product ideas BFF routes → NestJS /product-ideas. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const status = z.enum(IDEA_STATUSES);
const createBody = z.object({
  title: z.string().trim().max(160),
  problem: z.string().trim().max(2000),
  categoryCode: z.string().trim().max(60).nullish(),
  submitterName: z.string().trim().max(120).nullish(),
  submitterEmail: z.string().trim().max(160),
  status,
  adminNote: z.string().trim().max(2000).nullish(),
});
const updateBody = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().max(160).nullish(),
  problem: z.string().trim().max(2000).nullish(),
  categoryCode: z.string().trim().max(60).nullish(),
  submitterName: z.string().trim().max(120).nullish(),
  submitterEmail: z.string().trim().max(160).nullish(),
  status: status.nullish(),
  adminNote: z.string().trim().max(2000).nullish(),
});

export const { list, get, create, update, remove } = resourceRoutes<ProductIdea>(
  productIdeasResource,
  {
    access: {
      read: 'product-ideas:read',
      create: 'product-ideas:create',
      update: 'product-ideas:update',
      delete: 'product-ideas:delete',
    },
    schemas: { create: createBody, update: updateBody },
  },
);

export const exportRoute = resourceExportRoute<ProductIdea>(productIdeasResource, {
  access: 'product-ideas:read',
  fileName: 'product-ideas',
  columns: [
    { id: 'reference', header: 'productIdeas.fields.reference', value: (e) => e.reference },
    { id: 'title', header: 'productIdeas.fields.title', value: (e) => e.title },
    {
      id: 'categoryCode',
      header: 'productIdeas.fields.categoryCode',
      value: (e) => e.categoryCode,
    },
    {
      id: 'submitterName',
      header: 'productIdeas.fields.submitterName',
      value: (e) => e.submitterName,
    },
    {
      id: 'submitterEmail',
      header: 'productIdeas.fields.submitterEmail',
      value: (e) => e.submitterEmail,
    },
    { id: 'status', header: 'productIdeas.fields.status', value: (e) => e.status },
    { id: 'voteCount', header: 'productIdeas.fields.voteCount', value: (e) => e.voteCount },
    { id: 'updatedAt', header: 'productIdeas.columns.updated', value: (e) => e.updatedAt },
  ],
});
