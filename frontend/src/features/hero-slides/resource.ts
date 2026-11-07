import { defineResource } from '@/shared/data/resource';
import type { HeroSlide } from './types';

/** Hero carousel: one definition for query keys, hooks, BFF routes and server prefetch. */
export const heroSlidesResource = defineResource<HeroSlide>({
  name: 'hero-slides',
  apiPath: '/api/hero-slides',
  backendPath: '/hero-slides',
  listDefaults: { pageSize: 20, sort: [{ field: 'title', direction: 'asc' }] },
});
