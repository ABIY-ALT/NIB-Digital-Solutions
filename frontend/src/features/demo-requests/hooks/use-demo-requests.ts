'use client';

import { createResourceHooks } from '@/shared/data/resource-hooks';
import { demoRequestsResource } from '../resource';
import type { DemoRequest, DemoRequestInput } from '../types';

/** Demo requests hooks: component → hook → /api/demo-requests (Next.js) → NestJS. */
const demoRequests = createResourceHooks<DemoRequest, DemoRequestInput, DemoRequestInput>(
  demoRequestsResource,
);

export const demoRequestKeys = demoRequests.keys;
export const useDemoRequests = demoRequests.useList;
export const useSaveDemoRequest = demoRequests.useSave;
export const useDeleteDemoRequest = demoRequests.useRemove;
export const demoRequestsExportPath = demoRequests.exportPath;
export const useDemoRequest = demoRequests.useDetail;
