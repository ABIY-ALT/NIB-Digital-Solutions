import { z } from 'zod';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { demoRequestsResource } from '../resource';
import type { DemoRequest } from '../types';

/**
 * Demo requests BFF routes → NestJS /demo-requests. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const createBody = z.object({
  reference: z.string().trim().max(160),
  fullName: z.string().trim().max(160),
  organization: z.string().trim().max(160),
  jobTitle: z.string().trim().max(160),
  email: z.string().trim().max(160),
  phone: z.string().trim().max(160),
  productSlug: z.string().trim().max(160),
  demoType: z.string().trim().max(160),
  preferredDate: z.string().max(40).nullish(),
  preferredTime: z.string().trim().max(160).nullish(),
  requirements: z.string().trim().max(2000).nullish(),
  source: z.string().trim().max(160).nullish(),
  status: z.string().trim().max(160),
  assignedTo: z.string().trim().max(160).nullish(),
  followUpDate: z.string().max(40).nullish(),
});
const updateBody = z.object({
  version: z.number().int().min(1),
  reference: z.string().trim().max(160).nullish(),
  fullName: z.string().trim().max(160).nullish(),
  organization: z.string().trim().max(160).nullish(),
  jobTitle: z.string().trim().max(160).nullish(),
  email: z.string().trim().max(160).nullish(),
  phone: z.string().trim().max(160).nullish(),
  productSlug: z.string().trim().max(160).nullish(),
  demoType: z.string().trim().max(160).nullish(),
  preferredDate: z.string().max(40).nullish(),
  preferredTime: z.string().trim().max(160).nullish(),
  requirements: z.string().trim().max(2000).nullish(),
  source: z.string().trim().max(160).nullish(),
  status: z.string().trim().max(160).nullish(),
  assignedTo: z.string().trim().max(160).nullish(),
  followUpDate: z.string().max(40).nullish(),
});

export const { list, get, create, update, remove } = resourceRoutes<DemoRequest>(
  demoRequestsResource,
  {
    access: {
      read: 'demo-requests:read',
      create: 'demo-requests:create',
      update: 'demo-requests:update',
      delete: 'demo-requests:delete',
    },
    schemas: { create: createBody, update: updateBody },
  },
);

export const exportRoute = resourceExportRoute<DemoRequest>(demoRequestsResource, {
  access: 'demo-requests:read',
  fileName: 'demo-requests',
  columns: [
    { id: 'reference', header: 'demoRequests.fields.reference', value: (e) => e.reference },
    { id: 'fullName', header: 'demoRequests.fields.fullName', value: (e) => e.fullName },
    {
      id: 'organization',
      header: 'demoRequests.fields.organization',
      value: (e) => e.organization,
    },
    { id: 'jobTitle', header: 'demoRequests.fields.jobTitle', value: (e) => e.jobTitle },
    { id: 'email', header: 'demoRequests.fields.email', value: (e) => e.email },
    { id: 'phone', header: 'demoRequests.fields.phone', value: (e) => e.phone },
    { id: 'productSlug', header: 'demoRequests.fields.productSlug', value: (e) => e.productSlug },
    { id: 'demoType', header: 'demoRequests.fields.demoType', value: (e) => e.demoType },
    {
      id: 'preferredDate',
      header: 'demoRequests.fields.preferredDate',
      value: (e) => e.preferredDate,
    },
    {
      id: 'preferredTime',
      header: 'demoRequests.fields.preferredTime',
      value: (e) => e.preferredTime,
    },
    { id: 'source', header: 'demoRequests.fields.source', value: (e) => e.source },
    { id: 'status', header: 'demoRequests.fields.status', value: (e) => e.status },
    { id: 'assignedTo', header: 'demoRequests.fields.assignedTo', value: (e) => e.assignedTo },
    {
      id: 'followUpDate',
      header: 'demoRequests.fields.followUpDate',
      value: (e) => e.followUpDate,
    },
    { id: 'updatedAt', header: 'demoRequests.columns.updated', value: (e) => e.updatedAt },
  ],
});
