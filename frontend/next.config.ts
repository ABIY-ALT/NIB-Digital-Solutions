import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { staticSecurityHeaders } from './src/infrastructure/security/security-headers';

const withNextIntl = createNextIntlPlugin('./src/infrastructure/i18n/request.ts');

const nextConfig: NextConfig = {
  // Emit .next/standalone — a self-contained server bundle with only the
  // node_modules actually reachable at runtime. Keeps the runtime image small.
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // The floating dev badge overlaps the sidebar user card.
  devIndicators: false,
  // pino uses worker threads / dynamic requires — keep it out of the bundle.
  serverExternalPackages: ['pino', 'pino-pretty'],
  // Image optimizer (/_next/image): resizes uploaded marketplace images (hero
  // slides, product screenshots) and brand files to the width each screen
  // needs, as AVIF or WebP. Uploads are at most 2400 px wide (hero editor), so
  // larger widths are never offered. Results are cached for as long as the
  // source allows: media ids are immutable (one year).
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2400],
    localPatterns: [
      { pathname: '/api/marketplace/media/**', search: '' },
      { pathname: '/brand/**', search: '' },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  // The optimizer resizes with sharp, whose native libvips libraries are loaded
  // at run time, so file tracing leaves them out of .next/standalone (seen on
  // Windows: libvips-*.dll missing; on Alpine they live in
  // @img/sharp-libvips-linuxmusl-*). Without them the optimizer silently serves
  // every image at full size. Ship the platform's @img packages with the server.
  outputFileTracingIncludes: {
    '/**': ['./node_modules/@img/**/*'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders(process.env.NODE_ENV === 'production') },
      // Brand files (logo, honeycomb texture) keep their names across releases,
      // so they are cached for a week rather than forever.
      {
        source: '/brand/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      // The BFF relays live, per-user backend data and most routes set no cache
      // lifetime of their own, which leaves a shared proxy cache free to assume
      // one and hand one caller JSON meant for another. Say no-store instead.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      // Public marketplace pages embed demo videos (YouTube / Vimeo players do not
      // send CORP headers), so cross-origin isolation is relaxed there only. The
      // later rule wins for the same header; staff screens keep require-corp.
      ...[
        '/',
        '/products',
        '/products/:slug',
        '/industries',
        '/solutions',
        '/about',
        '/contact',
      ].map((source) => ({
        source,
        headers: [{ key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' }],
      })),
    ];
  },
};

export default withNextIntl(nextConfig);
