import { z } from 'zod';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { productInquiriesResource } from '../resource';
import type { ProductInquiry } from '../types';

/**
 * Product inquiries BFF routes → NestJS /product-inquiries. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const createBody = z.object({
  reference: z.string().trim().max(160),
  customerName: z.string().trim().max(160),
  company: z.string().trim().max(160).nullish(),
  email: z.string().trim().max(160),
  phone: z.string().trim().max(160).nullish(),
  productSlug: z.string().trim().max(160).nullish(),
  inquiryType: z.string().trim().max(160),
  message: z.string().trim().max(2000),
  requirements: z.string().trim().max(2000).nullish(),
  contactMethod: z.string().trim().max(160),
  source: z.string().trim().max(160).nullish(),
  status: z.string().trim().max(160),
  assignedTo: z.string().trim().max(160).nullish(),
  respondedAt: z.string().max(40).nullish(),
});
const updateBody = z.object({
  version: z.number().int().min(1),
  reference: z.string().trim().max(160).nullish(),
  customerName: z.string().trim().max(160).nullish(),
  company: z.string().trim().max(160).nullish(),
  email: z.string().trim().max(160).nullish(),
  phone: z.string().trim().max(160).nullish(),
  productSlug: z.string().trim().max(160).nullish(),
  inquiryType: z.string().trim().max(160).nullish(),
  message: z.string().trim().max(2000).nullish(),
  requirements: z.string().trim().max(2000).nullish(),
  contactMethod: z.string().trim().max(160).nullish(),
  source: z.string().trim().max(160).nullish(),
  status: z.string().trim().max(160).nullish(),
  assignedTo: z.string().trim().max(160).nullish(),
  respondedAt: z.string().max(40).nullish(),
});

export const { list, get, create, update, remove } = resourceRoutes<ProductInquiry>(
  productInquiriesResource,
  {
    access: {
      read: 'product-inquiries:read',
      create: 'product-inquiries:create',
      update: 'product-inquiries:update',
      delete: 'product-inquiries:delete',
    },
    schemas: { create: createBody, update: updateBody },
  },
);

export const exportRoute = resourceExportRoute<ProductInquiry>(productInquiriesResource, {
  access: 'product-inquiries:read',
  fileName: 'product-inquiries',
  columns: [
    { id: 'reference', header: 'productInquiries.fields.reference', value: (e) => e.reference },
    {
      id: 'customerName',
      header: 'productInquiries.fields.customerName',
      value: (e) => e.customerName,
    },
    { id: 'company', header: 'productInquiries.fields.company', value: (e) => e.company },
    { id: 'email', header: 'productInquiries.fields.email', value: (e) => e.email },
    { id: 'phone', header: 'productInquiries.fields.phone', value: (e) => e.phone },
    {
      id: 'productSlug',
      header: 'productInquiries.fields.productSlug',
      value: (e) => e.productSlug,
    },
    {
      id: 'inquiryType',
      header: 'productInquiries.fields.inquiryType',
      value: (e) => e.inquiryType,
    },
    {
      id: 'contactMethod',
      header: 'productInquiries.fields.contactMethod',
      value: (e) => e.contactMethod,
    },
    { id: 'source', header: 'productInquiries.fields.source', value: (e) => e.source },
    { id: 'status', header: 'productInquiries.fields.status', value: (e) => e.status },
    { id: 'assignedTo', header: 'productInquiries.fields.assignedTo', value: (e) => e.assignedTo },
    {
      id: 'respondedAt',
      header: 'productInquiries.fields.respondedAt',
      value: (e) => e.respondedAt,
    },
    { id: 'updatedAt', header: 'productInquiries.columns.updated', value: (e) => e.updatedAt },
  ],
});
