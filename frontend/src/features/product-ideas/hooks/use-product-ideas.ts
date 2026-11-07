'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { productIdeasResource } from '../resource';
import type { ProductIdea, ProductIdeaInput } from '../types';

/** Product ideas hooks: component → hook → /api/product-ideas (Next.js) → NestJS. */
const productIdeas = createResourceHooks<ProductIdea, ProductIdeaInput, ProductIdeaInput>(
  productIdeasResource,
);

export const productIdeaKeys = productIdeas.keys;
export const useProductIdeas = productIdeas.useList;
export const useSaveProductIdea = productIdeas.useSave;
export const useDeleteProductIdea = productIdeas.useRemove;
export const productIdeasExportPath = productIdeas.exportPath;
