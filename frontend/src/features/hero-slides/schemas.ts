import { z } from 'zod';
import type { HeroSlide, HeroSlideInput } from './types';

type T = (key: string) => string;
const id: T = (k) => k;

/**
 * Where a slide's button may point (mirrors the backend rule): a path on this
 * site ("/products", "#contact") or an https:// address.
 */
export function isSafeHref(href: string): boolean {
  if (/\s/.test(href)) return false;
  if (href.startsWith('#')) return href.length > 1;
  if (href.startsWith('/')) return !href.startsWith('//') && !href.startsWith('/\\');
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && !!url.hostname;
  } catch {
    return false;
  }
}

/** Form schema. The backend validates the same rules again (it is the authority). */
export const heroSlideFormSchema = (t: T = id) =>
  z
    .object({
      title: z.string().trim().max(160),
      description: z.string().trim().max(2000),
      ctaLabel: z.string().trim().max(160),
      ctaHref: z.string().trim().max(160),
      desktopImageId: z.string().trim().min(1, t('validation.image')).max(160),
      mobileImageId: z.string().trim().max(160),
      altText: z.string().trim().max(160),
      active: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.ctaLabel && !v.ctaHref)
        ctx.addIssue({ code: 'custom', path: ['ctaHref'], message: t('validation.ctaHref') });
      if (v.ctaHref && !v.ctaLabel)
        ctx.addIssue({ code: 'custom', path: ['ctaLabel'], message: t('validation.ctaLabel') });
      if (v.ctaHref && !isSafeHref(v.ctaHref))
        ctx.addIssue({ code: 'custom', path: ['ctaHref'], message: t('validation.href') });
    });
export type HeroSlideFormValues = z.infer<ReturnType<typeof heroSlideFormSchema>>;

export const heroSlideFormDefaults = (e?: HeroSlide | null): HeroSlideFormValues => ({
  title: e?.title ?? '',
  description: e?.description ?? '',
  ctaLabel: e?.ctaLabel ?? '',
  ctaHref: e?.ctaHref ?? '',
  desktopImageId: e?.desktopImageId ?? '',
  mobileImageId: e?.mobileImageId ?? '',
  altText: e?.altText ?? '',
  // New slides are shown by default; the position is set by dragging in the list.
  active: e?.active ?? true,
});

export const toHeroSlideInput = (v: HeroSlideFormValues): HeroSlideInput => ({
  title: v.title || null,
  description: v.description || null,
  ctaLabel: v.ctaLabel || null,
  ctaHref: v.ctaHref || null,
  desktopImageId: v.desktopImageId,
  mobileImageId: v.mobileImageId || null,
  altText: v.altText || null,
  active: v.active,
});
