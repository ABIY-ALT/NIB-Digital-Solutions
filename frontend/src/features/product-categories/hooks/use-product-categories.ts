'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { productCategoriesResource } from '../resource';
import type { ProductCategory, ProductCategoryInput } from '../types';

/** Product categories hooks: component → hook → /api/product-categories (Next.js) → NestJS. */
const productCategories = createResourceHooks<
  ProductCategory,
  ProductCategoryInput,
  ProductCategoryInput
>(productCategoriesResource);

export const productCategoryKeys = productCategories.keys;
export const useProductCategories = productCategories.useList;
export const useSaveProductCategory = productCategories.useSave;
export const useDeleteProductCategory = productCategories.useRemove;
export const productCategoriesExportPath = productCategories.exportPath;
export const useProductCategory = productCategories.useDetail;
export const useAllProductCategories = productCategories.useAll;
