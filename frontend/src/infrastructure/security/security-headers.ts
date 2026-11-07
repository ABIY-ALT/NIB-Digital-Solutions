/**
 * OWASP-aligned security headers. Static headers are set in next.config.ts;
 * the Content-Security-Policy (with a per-request nonce) is set in proxy.ts.
 */
/** Hosts the public marketplace may embed product demo videos from (privacy-enhanced players). */
export const VIDEO_FRAME_SOURCES = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'];

export function buildCsp(
  nonce: string,
  isDev: boolean,
  options: { videoEmbeds?: boolean } = {},
): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Radix/Next inject inline style attributes; styles cannot execute code.
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'connect-src': ["'self'", ...(isDev ? ['ws:', 'wss:'] : [])],
    ...(options.videoEmbeds
      ? { 'frame-src': VIDEO_FRAME_SOURCES, 'media-src': ["'self'", 'https:'] }
      : {}),
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    ...(isDev ? {} : { 'upgrade-insecure-requests': [] }),
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

export function staticSecurityHeaders(
  isProduction: boolean,
): Array<{ key: string; value: string }> {
  return [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    // Cross-origin isolation. Every resource the app loads is same-origin
    // (next/font serves the font from /_next), so the strictest value is free.
    { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    // Lets the server render "system" colour mode correctly on the first paint (Chromium).
    { key: 'Accept-CH', value: 'Sec-CH-Prefers-Color-Scheme' },
    { key: 'Vary', value: 'Sec-CH-Prefers-Color-Scheme' },
    { key: 'Critical-CH', value: 'Sec-CH-Prefers-Color-Scheme' },
    ...(isProduction
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ]
      : []),
  ];
}
