'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { productDevelopersResource } from '../resource';
import type { ProductDeveloper, ProductDeveloperInput } from '../types';

/** Product developers hooks: component → hook → /api/product-developers (Next.js) → NestJS. */
const productDevelopers = createResourceHooks<
  ProductDeveloper,
  ProductDeveloperInput,
  ProductDeveloperInput
>(productDevelopersResource);

export const productDeveloperKeys = productDevelopers.keys;
export const useProductDevelopers = productDevelopers.useList;
export const useSaveProductDeveloper = productDevelopers.useSave;
export const useDeleteProductDeveloper = productDevelopers.useRemove;
export const productDevelopersExportPath = productDevelopers.exportPath;
