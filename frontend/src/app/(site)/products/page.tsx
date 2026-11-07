import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getCatalog } from '@/features/marketplace/api/catalog.server';
import { CatalogPage } from '@/features/marketplace/components/site/catalog-page';
import { CatalogUnavailable } from '@/features/marketplace/components/site/info-pages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketplace');
  return {
    title: t('catalog.title'),
    description: t('catalog.meta'),
    alternates: { canonical: '/products' },
  };
}

export default async function Page() {
  const { unavailable } = await getCatalog();
  if (unavailable) return <CatalogUnavailable />;
  // useSearchParams (filters in the URL) needs a Suspense boundary.
  return (
    <Suspense>
      <CatalogPage />
    </Suspense>
  );
}
