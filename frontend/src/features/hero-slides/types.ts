import type { ApiSchemas } from '@/shared/api';

/** Hero slide as returned by the API (shared contract, generated from the backend). */
export type HeroSlide = ApiSchemas['HeroSlide'];

/** Create / update body (dates as ISO strings). */
export interface HeroSlideInput {
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  desktopImageId?: string;
  mobileImageId?: string | null;
  altText?: string | null;
  sortOrder?: number | null;
  active?: boolean;
  version?: number;
}

/** How the homepage carousel rotates and which controls it shows. */
export type HeroCarouselSettings = ApiSchemas['HeroCarouselSettings'];
export type HeroNavigation = HeroCarouselSettings['navigation'];
