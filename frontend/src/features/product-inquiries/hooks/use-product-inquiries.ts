'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { productInquiriesResource } from '../resource';
import type { ProductInquiry, ProductInquiryInput } from '../types';

/** Product inquiries hooks: component → hook → /api/product-inquiries (Next.js) → NestJS. */
const productInquiries = createResourceHooks<
  ProductInquiry,
  ProductInquiryInput,
  ProductInquiryInput
>(productInquiriesResource);

export const productInquiryKeys = productInquiries.keys;
export const useProductInquiries = productInquiries.useList;
export const useSaveProductInquiry = productInquiries.useSave;
export const useDeleteProductInquiry = productInquiries.useRemove;
export const productInquiriesExportPath = productInquiries.exportPath;
export const useProductInquiry = productInquiries.useDetail;
