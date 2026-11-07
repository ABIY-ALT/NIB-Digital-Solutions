import { getCatalog } from '@/features/marketplace/api/catalog.server';
import { getHeroCarousel } from '@/features/marketplace/api/hero.server';
import { HomePage } from '@/features/marketplace/components/site/home-page';
import { CatalogUnavailable } from '@/features/marketplace/components/site/info-pages';

export default async function Page() {
  const [{ unavailable }, hero] = await Promise.all([getCatalog(), getHeroCarousel()]);
  return unavailable ? <CatalogUnavailable /> : <HomePage hero={hero} />;
}
