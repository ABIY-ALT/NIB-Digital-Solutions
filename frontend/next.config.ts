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
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders(process.env.NODE_ENV === 'production') },
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
