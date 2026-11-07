'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { digitalProductsResource } from '../resource';
import type { DigitalProduct, DigitalProductInput } from '../types';

/** Digital products hooks: component → hook → /api/digital-products (Next.js) → NestJS. */
const digitalProducts = createResourceHooks<
  DigitalProduct,
  DigitalProductInput,
  DigitalProductInput
>(digitalProductsResource);

export const digitalProductKeys = digitalProducts.keys;
export const useDigitalProducts = digitalProducts.useList;
export const useSaveDigitalProduct = digitalProducts.useSave;
export const useDeleteDigitalProduct = digitalProducts.useRemove;
export const digitalProductsExportPath = digitalProducts.exportPath;
export const useDigitalProduct = digitalProducts.useDetail;
export const useAllDigitalProducts = digitalProducts.useAll;
