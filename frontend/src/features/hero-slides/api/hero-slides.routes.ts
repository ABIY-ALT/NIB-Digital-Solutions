import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import { resourceRoutes } from '@/features/auth/api/resource-routes';
import { resourceExportRoute } from '@/features/auth/api/resource-transfer';
import { heroSlidesResource } from '../resource';
import type { HeroCarouselSettings, HeroSlide } from '../types';

/**
 * Hero carousel BFF routes → NestJS /hero-slides. Bodies are bounded here; the
 * backend validates business rules and applies the maker–checker policy.
 */
const createBody = z.object({
  title: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(2000).nullish(),
  ctaLabel: z.string().trim().max(160).nullish(),
  ctaHref: z.string().trim().max(160).nullish(),
  desktopImageId: z.string().trim().max(160),
  mobileImageId: z.string().trim().max(160).nullish(),
  altText: z.string().trim().max(160).nullish(),
  sortOrder: z.number().int().nullish(),
  active: z.boolean(),
});
const updateBody = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(2000).nullish(),
  ctaLabel: z.string().trim().max(160).nullish(),
  ctaHref: z.string().trim().max(160).nullish(),
  desktopImageId: z.string().trim().max(160).nullish(),
  mobileImageId: z.string().trim().max(160).nullish(),
  altText: z.string().trim().max(160).nullish(),
  sortOrder: z.number().int().nullish(),
  active: z.boolean().nullish(),
});

export const { list, get, create, update, remove } = resourceRoutes<HeroSlide>(heroSlidesResource, {
  access: {
    read: 'hero-slides:read',
    create: 'hero-slides:create',
    update: 'hero-slides:update',
    delete: 'hero-slides:delete',
  },
  schemas: { create: createBody, update: updateBody },
});

export const exportRoute = resourceExportRoute<HeroSlide>(heroSlidesResource, {
  access: 'hero-slides:read',
  fileName: 'hero-slides',
  columns: [
    { id: 'title', header: 'heroSlides.fields.title', value: (e) => e.title },
    { id: 'ctaLabel', header: 'heroSlides.fields.ctaLabel', value: (e) => e.ctaLabel },
    { id: 'ctaHref', header: 'heroSlides.fields.ctaHref', value: (e) => e.ctaHref },
    {
      id: 'desktopImageId',
      header: 'heroSlides.fields.desktopImageId',
      value: (e) => e.desktopImageId,
    },
    {
      id: 'mobileImageId',
      header: 'heroSlides.fields.mobileImageId',
      value: (e) => e.mobileImageId,
    },
    { id: 'altText', header: 'heroSlides.fields.altText', value: (e) => e.altText },
    { id: 'sortOrder', header: 'heroSlides.fields.sortOrder', value: (e) => e.sortOrder },
    { id: 'active', header: 'heroSlides.fields.active', value: (e) => e.active },
    { id: 'updatedAt', header: 'heroSlides.columns.updated', value: (e) => e.updatedAt },
  ],
});

// ── Hand-written: display order and carousel settings ──────────────────────

/** Every slide in display order (the administration screen). */
export const ordered = apiRoute<HeroSlide[]>(
  { requires: { permission: 'hero-slides:read' } },
  async ({ api }) => ({ data: (await api.get<HeroSlide[]>('/hero-slides/ordered')).data }),
);

const reorderBody = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

/** Sets the display order (every slide id once, first to last). */
export const reorder = apiRoute<HeroSlide[]>(
  { requires: { permission: 'hero-slides:update' } },
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(reorderBody));
    const res = await api.post<HeroSlide[]>('/hero-slides/reorder', body);
    return { data: res.data, message: res.message };
  },
);

export const getSettings = apiRoute<HeroCarouselSettings>(
  { requires: { permission: 'hero-slides:read' } },
  async ({ api }) => ({
    data: (await api.get<HeroCarouselSettings>('/hero-slides/settings')).data,
  }),
);

const settingsBody = z.object({
  autoplay: z.boolean().optional(),
  intervalSeconds: z.number().int().min(3).max(30).optional(),
  transitionMs: z.number().int().min(200).max(2000).optional(),
  pauseOnHover: z.boolean().optional(),
  navigation: z.enum(['arrows-and-dots', 'dots', 'arrows']).optional(),
});

export const updateSettings = apiRoute<HeroCarouselSettings>(
  { requires: { permission: 'hero-slides:update' } },
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(settingsBody));
    const res = await api.patch<HeroCarouselSettings>('/hero-slides/settings', body);
    return { data: res.data, message: res.message };
  },
);
