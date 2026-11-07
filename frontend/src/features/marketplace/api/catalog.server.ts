import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { cache } from 'react';
import { backend } from '@/infrastructure/api/backend';
import { logger } from '@/infrastructure/logging/logger';
import type { MarketplaceCatalog } from '../types';

/**
 * Server-side catalog read for the public site (server components): one
 * backend call per request, shared by the layout and the page through
 * React's request cache. Uses the BFF service identity; no user session.
 */
export const getCatalog = cache(
  async (): Promise<MarketplaceCatalog & { unavailable: boolean }> => {
    try {
      // Industries and needs come translated into the reader's language.
      const locale = await getLocale();
      const res = await backend().get<MarketplaceCatalog>('/marketplace/catalog', {
        query: { locale },
      });
      return { ...res.data, unavailable: false };
    } catch (error) {
      // Next.js control-flow signals (dynamic rendering, redirects) must propagate.
      unstable_rethrow(error);
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Marketplace catalog unavailable',
      );
      return { products: [], categories: [], industries: [], needs: [], unavailable: true };
    }
  },
);

export async function getPublishedProduct(slug: string) {
  const { products } = await getCatalog();
  return products.find((p) => p.slug === slug) ?? null;
}
