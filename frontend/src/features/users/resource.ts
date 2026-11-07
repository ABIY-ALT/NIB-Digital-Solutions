import { defineResource } from '@/shared/data/resource';
import type { User } from './types';

/** Users resource — one definition for query keys, hooks, BFF routes and server prefetch. */
export const usersResource = defineResource<User>({
  name: 'users',
  apiPath: '/api/users',
  backendPath: '/users',
  listDefaults: { pageSize: 20, sort: [{ field: 'createdAt', direction: 'desc' }] },
});
