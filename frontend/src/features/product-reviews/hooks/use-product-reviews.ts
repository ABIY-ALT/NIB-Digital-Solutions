'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { productReviewsResource } from '../resource';
import type { ProductReview, ProductReviewInput } from '../types';

/** Product reviews hooks: component → hook → /api/product-reviews (Next.js) → NestJS. */
const productReviews = createResourceHooks<ProductReview, ProductReviewInput, ProductReviewInput>(
  productReviewsResource,
);

export const productReviewKeys = productReviews.keys;
export const useProductReviews = productReviews.useList;
export const useSaveProductReview = productReviews.useSave;
export const useDeleteProductReview = productReviews.useRemove;
export const productReviewsExportPath = productReviews.exportPath;
