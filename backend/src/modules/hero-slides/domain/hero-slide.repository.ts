import type { Repository } from '#core/domain/repository.js';
import type { HeroSlide } from './hero-slide.entity.js';

export interface HeroSlideRepository extends Repository<HeroSlide> {
  /** Every slide (or only the active ones) in display order: position, then creation time. */
  findOrdered(options?: { activeOnly?: boolean }): Promise<HeroSlide[]>;
  /** The ids among `ids` that are not an uploaded image. */
  missingMedia(ids: readonly string[]): Promise<string[]>;
}

export const HERO_SLIDE_REPOSITORY = Symbol('HeroSlideRepository');
