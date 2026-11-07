import type { MetadataRoute } from 'next';
import { getCatalog } from '@/features/marketplace/api/catalog.server';
import { siteUrl } from '@/features/marketplace/api/site-url';

/** Built per request: products published in the admin portal are listed immediately. */
export const dynamic = 'force-dynamic';

const PAGES: { path: string; priority: number }[] = [
  { path: '', priority: 1 },
  { path: '/products', priority: 0.9 },
  { path: '/ideas', priority: 0.6 },
  { path: '/about', priority: 0.5 },
  { path: '/contact', priority: 0.6 },
];

/** sitemap.xml of the public NIB Digital Solutions website (published products only). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const { products } = await getCatalog();
  const latest = products.reduce<string | undefined>(
    (max, p) => (!max || p.updatedAt > max ? p.updatedAt : max),
    undefined,
  );
  return [
    ...PAGES.map(({ path, priority }) => ({
      url: `${base}${path}`,
      ...(latest ? { lastModified: latest } : {}),
      changeFrequency: 'weekly' as const,
      priority,
    })),
    ...products.map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: p.featured ? 0.8 : 0.7,
    })),
  ];
}
