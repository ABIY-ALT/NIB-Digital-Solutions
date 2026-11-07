import type { MetadataRoute } from 'next';
import { siteUrl } from '@/features/marketplace/api/site-url';
import { appConfig } from '@/infrastructure/config/app.config';
import type { NavItem } from '@/infrastructure/config/navigation';

export const dynamic = 'force-dynamic';

/** Staff application routes (from the navigation, so generated features are covered too). */
function staffPaths(): string[] {
  const paths = new Set<string>(['/api/', '/login', '/forgot-password', '/reset-password']);
  const walk = (items: NavItem[]) => {
    for (const item of items) {
      if (item.href && item.href !== '/') paths.add(item.href);
      if (item.children) walk(item.children);
    }
  };
  appConfig.navigation.forEach((section) => walk(section.items));
  return [...paths].sort();
}

/** robots.txt: the public website is indexed; the staff portal and the APIs are not. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: { userAgent: '*', allow: '/', disallow: staffPaths() },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
