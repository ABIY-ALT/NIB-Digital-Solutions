import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { backend } from '@/infrastructure/api/backend';
import { logger } from '@/infrastructure/logging/logger';
import type { PublicHeroCarousel } from '../types';

/** Used when the carousel cannot be loaded: no slides, so the page shows its text banner. */
const UNAVAILABLE: PublicHeroCarousel = {
  slides: [],
  settings: {
    autoplay: true,
    intervalSeconds: 7,
    transitionMs: 700,
    pauseOnHover: true,
    navigation: 'arrows-and-dots',
  },
};

/**
 * The homepage carousel (active slides in order + settings), read on the
 * server for every request, so changes made in the administration screen
 * appear on the next page load without a deployment.
 */
export const getHeroCarousel = cache(async (): Promise<PublicHeroCarousel> => {
  try {
    return (await backend().get<PublicHeroCarousel>('/marketplace/hero')).data;
  } catch (error) {
    // Next.js control-flow signals (dynamic rendering, redirects) must propagate.
    unstable_rethrow(error);
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Hero carousel unavailable',
    );
    return UNAVAILABLE;
  }
});
