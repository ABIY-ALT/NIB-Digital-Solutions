import { z } from 'zod';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { digitalProductsResource } from '../resource';
import type { DigitalProduct } from '../types';

/**
 * Digital products BFF routes → NestJS /digital-products. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const createBody = z.object({
  slug: z.string().trim().max(160),
  name: z.string().trim().max(160),
  tagline: z.string().trim().max(160).nullish(),
  summary: z.string().trim().max(2000),
  overview: z.string().trim().max(2000).nullish(),
  problem: z.string().trim().max(2000).nullish(),
  categoryCode: z.string().trim().max(160),
  status: z.string().trim().max(160),
  availability: z.string().trim().max(160),
  featured: z.boolean(),
  customizable: z.boolean(),
  icon: z.string().trim().max(160).nullish(),
  accent: z.string().trim().max(160).nullish(),
  // Marketplace extensions (hand-written): shapes are validated by the backend contract.
  industries: z.array(z.string().max(40)).max(8).optional(),
  needs: z.array(z.string().max(40)).max(7).optional(),
  deployment: z.array(z.string().max(20)).max(3).optional(),
  platforms: z.array(z.string().max(20)).max(4).optional(),
  keyFeatures: z.array(z.string().trim().max(120)).max(6).optional(),
  content: z
    .record(z.string(), z.unknown())
    .refine((v) => JSON.stringify(v).length <= 200_000, 'Page content is too large')
    .optional(),
  documentation: z
    .array(z.object({ title: z.string().max(120), body: z.string().max(4000) }))
    .max(30)
    .optional(),
  /** Launch planning and developer support (the backend validates the values). */
  releaseDate: z.iso.date().nullish(),
  developerId: z.uuid().nullish(),
  backupDeveloperId: z.uuid().nullish(),
  thirdDeveloperId: z.uuid().nullish(),
  supportStatus: z.enum(['active', 'limited', 'paused']).optional(),
});
const updateBody = z.object({
  version: z.number().int().min(1),
  slug: z.string().trim().max(160).nullish(),
  name: z.string().trim().max(160).nullish(),
  tagline: z.string().trim().max(160).nullish(),
  summary: z.string().trim().max(2000).nullish(),
  overview: z.string().trim().max(2000).nullish(),
  problem: z.string().trim().max(2000).nullish(),
  categoryCode: z.string().trim().max(160).nullish(),
  status: z.string().trim().max(160).nullish(),
  availability: z.string().trim().max(160).nullish(),
  featured: z.boolean().nullish(),
  customizable: z.boolean().nullish(),
  icon: z.string().trim().max(160).nullish(),
  accent: z.string().trim().max(160).nullish(),
  // Marketplace extensions (hand-written): shapes are validated by the backend contract.
  industries: z.array(z.string().max(40)).max(8).optional(),
  needs: z.array(z.string().max(40)).max(7).optional(),
  deployment: z.array(z.string().max(20)).max(3).optional(),
  platforms: z.array(z.string().max(20)).max(4).optional(),
  keyFeatures: z.array(z.string().trim().max(120)).max(6).optional(),
  content: z
    .record(z.string(), z.unknown())
    .refine((v) => JSON.stringify(v).length <= 200_000, 'Page content is too large')
    .optional(),
  documentation: z
    .array(z.object({ title: z.string().max(120), body: z.string().max(4000) }))
    .max(30)
    .optional(),
  /** Launch planning and developer support (the backend validates the values). */
  releaseDate: z.iso.date().nullish(),
  developerId: z.uuid().nullish(),
  backupDeveloperId: z.uuid().nullish(),
  thirdDeveloperId: z.uuid().nullish(),
  supportStatus: z.enum(['active', 'limited', 'paused']).nullish(),
});

export const { list, get, create, update, remove } = resourceRoutes<DigitalProduct>(
  digitalProductsResource,
  {
    access: {
      read: 'digital-products:read',
      create: 'digital-products:create',
      update: 'digital-products:update',
      delete: 'digital-products:delete',
    },
    schemas: { create: createBody, update: updateBody },
  },
);

export const exportRoute = resourceExportRoute<DigitalProduct>(digitalProductsResource, {
  access: 'digital-products:read',
  fileName: 'digital-products',
  columns: [
    { id: 'slug', header: 'digitalProducts.fields.slug', value: (e) => e.slug },
    { id: 'name', header: 'digitalProducts.fields.name', value: (e) => e.name },
    { id: 'tagline', header: 'digitalProducts.fields.tagline', value: (e) => e.tagline },
    {
      id: 'categoryCode',
      header: 'digitalProducts.fields.categoryCode',
      value: (e) => e.categoryCode,
    },
    { id: 'status', header: 'digitalProducts.fields.status', value: (e) => e.status },
    {
      id: 'availability',
      header: 'digitalProducts.fields.availability',
      value: (e) => e.availability,
    },
    { id: 'featured', header: 'digitalProducts.fields.featured', value: (e) => e.featured },
    {
      id: 'customizable',
      header: 'digitalProducts.fields.customizable',
      value: (e) => e.customizable,
    },
    { id: 'icon', header: 'digitalProducts.fields.icon', value: (e) => e.icon },
    { id: 'accent', header: 'digitalProducts.fields.accent', value: (e) => e.accent },
    { id: 'updatedAt', header: 'digitalProducts.columns.updated', value: (e) => e.updatedAt },
  ],
});
