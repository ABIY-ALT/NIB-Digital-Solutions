import { defineResource } from '@/shared/data/resource';
import type { DemoRequest } from './types';

/** Demo requests: one definition for query keys, hooks, BFF routes and server prefetch. */
export const demoRequestsResource = defineResource<DemoRequest>({
  name: 'demo-requests',
  apiPath: '/api/demo-requests',
  backendPath: '/demo-requests',
  listDefaults: { pageSize: 20, sort: [{ field: 'reference', direction: 'asc' }] },
});
