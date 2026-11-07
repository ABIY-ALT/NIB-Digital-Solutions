import { z } from 'zod';
import { getSessionUser } from '@/features/auth/api/session';
import { parseWith, publicApiRoute, readJson } from '@/features/auth/api/api-route';
import { logger } from '@/infrastructure/logging/logger';
import { rateLimit } from '@/infrastructure/security/rate-limit';
import { ApiClientError } from '@/shared/errors/api-client-error';

const report = z.object({
  kind: z.enum(['boundary', 'route', 'global', 'unhandled', 'rejection']),
  name: z.string().max(100),
  message: z.string().max(500),
  stack: z.string().max(4_000).optional(),
  componentStack: z.string().max(2_000).optional(),
  digest: z.string().max(100).optional(),
  path: z
    .string()
    .max(300)
    .regex(/^\/[^?#]*$/, 'path only'),
});

/**
 * POST /api/client-errors — browser crash reports → structured server log.
 * Public (a crash may happen signed out) but CSRF/Origin-checked and rate-limited
 * per client IP. The user id is attached when a session exists.
 */
export const reportClientError = publicApiRoute(async ({ req, clientIp, correlationId }) => {
  const limit = rateLimit(`client-errors:${clientIp}`, 30, 60);
  if (!limit.allowed) {
    throw new ApiClientError({
      code: 'RATE_LIMITED',
      message: 'Too many error reports.',
      status: 429,
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }
  const body = await readJson(req, parseWith(report));
  const user = await getSessionUser().catch(() => null);
  logger.error(
    {
      correlationId,
      source: 'browser',
      userId: user?.id,
      ...body,
      // Stacks are useful in development; production keeps only the first frames.
      stack:
        process.env.NODE_ENV === 'production'
          ? body.stack?.split('\n').slice(0, 6).join('\n')
          : body.stack,
      userAgent: req.headers.get('user-agent')?.slice(0, 200),
    },
    'Client error reported',
  );
  return { data: null, status: 202 };
});
