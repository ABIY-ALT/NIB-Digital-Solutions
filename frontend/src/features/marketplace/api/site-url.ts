import 'server-only';

/**
 * Public address of the website, without a trailing slash: SITE_URL, else the
 * application address (AUTH_URL), else the local development server. Used for
 * canonical URLs, the sitemap and robots.txt.
 */
export function siteUrl(): string {
  const raw = process.env.SITE_URL || process.env.AUTH_URL || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}
