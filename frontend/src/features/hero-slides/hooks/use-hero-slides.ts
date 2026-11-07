'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/infrastructure/api/api-fetch';
import { createResourceHooks } from '@/shared/data/resource-hooks';
import { heroSlidesResource } from '../resource';
import type { HeroCarouselSettings, HeroSlide, HeroSlideInput } from '../types';

/** Hero carousel hooks: component → hook → /api/hero-slides (Next.js) → NestJS. */
const heroSlides = createResourceHooks<HeroSlide, HeroSlideInput, HeroSlideInput>(
  heroSlidesResource,
);

export const heroSlideKeys = heroSlides.keys;
export const useHeroSlides = heroSlides.useList;
export const useSaveHeroSlide = heroSlides.useSave;
export const useDeleteHeroSlide = heroSlides.useRemove;
export const heroSlidesExportPath = heroSlides.exportPath;

// Nested under `keys.all`, so every save, delete or reorder refreshes them.
const orderedKey = [...heroSlideKeys.all, 'ordered'] as const;
const settingsKey = [...heroSlideKeys.all, 'settings'] as const;

/** Every slide in display order. */
export function useOrderedHeroSlides() {
  return useQuery({
    queryKey: orderedKey,
    queryFn: async ({ signal }) =>
      (await apiFetch<HeroSlide[]>('/api/hero-slides/ordered', { signal })).data,
  });
}

/** Saves a new display order (every slide id once, first to last). */
export function useReorderHeroSlides() {
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await apiFetch<HeroSlide[]>('/api/hero-slides/reorder', { method: 'POST', body: { ids } }))
        .data,
    meta: { invalidates: [heroSlideKeys.all] },
  });
}

export function useHeroSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: async ({ signal }) =>
      (await apiFetch<HeroCarouselSettings>('/api/hero-slides/settings', { signal })).data,
  });
}

export function useUpdateHeroSettings() {
  return useMutation({
    mutationFn: async (values: Partial<HeroCarouselSettings>) =>
      (
        await apiFetch<HeroCarouselSettings>('/api/hero-slides/settings', {
          method: 'PATCH',
          body: values,
        })
      ).data,
    meta: { invalidates: [settingsKey] },
  });
}

// ── Image preparation and upload ────────────────────────────────────────────

/** Uploaded image: stored media id and the public URL the website serves it from. */
export interface UploadedImage {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export type ImageKind = 'desktop' | 'mobile';

/** Longest side after resizing; large enough for 2× screens, small enough to load fast. */
const MAX_WIDTH: Record<ImageKind, number> = { desktop: 2400, mobile: 1200 };
/** Upload budget (the media store accepts up to 700 KB). */
const MAX_BYTES = 650_000;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

export class ImagePrepError extends Error {
  constructor(readonly reason: 'type' | 'decode' | 'tooLarge') {
    super(reason);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Resizes (never upscales, never crops) and re-encodes the image as WebP (JPEG
 * on Safari) in the browser, lowering the quality step by step until it fits
 * the upload budget.
 * Visitors download a small, modern file; the proportions stay as designed.
 */
export async function prepareHeroImage(
  file: File,
  kind: ImageKind,
): Promise<{
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}> {
  if (!ACCEPTED.includes(file.type)) throw new ImagePrepError('type');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePrepError('decode');
  }
  const scale = Math.min(1, MAX_WIDTH[kind] / bitmap.width);
  let width = Math.round(bitmap.width * scale);
  let height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  // Safari cannot encode WebP from a canvas (it silently returns PNG): use JPEG there.
  canvas.width = canvas.height = 1;
  const type = canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImagePrepError('decode');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.86, 0.8, 0.72, 0.64]) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
        if (blob && blob.type === type && blob.size <= MAX_BYTES)
          return { blob, width, height, sourceWidth: bitmap.width, sourceHeight: bitmap.height };
      }
      // Still too heavy (very detailed photo): step the size down and try again.
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
    }
    throw new ImagePrepError('tooLarge');
  } finally {
    bitmap.close();
  }
}

/** Prepares an image (see `prepareHeroImage`) and stores it through the secure media upload. */
export function useUploadHeroImage() {
  return useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: ImageKind }): Promise<UploadedImage> => {
      const prepared = await prepareHeroImage(file, kind);
      const data = await blobToBase64(prepared.blob);
      const res = await apiFetch<{ id: string; url: string }>('/api/marketplace/admin/media', {
        method: 'POST',
        body: { data },
        timeoutMs: 60_000,
      });
      return {
        id: res.data.id,
        url: res.data.url,
        width: prepared.width,
        height: prepared.height,
        bytes: prepared.blob.size,
      };
    },
  });
}

/** Public URL of an uploaded image id (same as the backend's media URL). */
export const heroImageUrl = (id: string) => `/api/marketplace/media/${id}`;
