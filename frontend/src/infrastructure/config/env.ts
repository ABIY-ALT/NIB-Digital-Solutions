import { z } from 'zod';
import { parseKeyRing, type KeyRing } from '@/infrastructure/security/payload-crypto';

/**
 * Server-side environment (secrets). Validated on first use; an invalid
 * environment throws with a readable list of problems. Never import from
 * client components.
 */
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Exported for the CLI (`npm run cli -- env:check`), which validates without starting Next.js. */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BACKEND_URL: z.url(),
    BACKEND_API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    BACKEND_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),
    BACKEND_SERVICE_CLIENT_ID: z.string().min(1),
    BACKEND_SERVICE_CLIENT_SECRET: z.string().min(32),
    PAYLOAD_ENCRYPTION_ENABLED: bool.default(true),
    PAYLOAD_ENCRYPTION_KEYS: z.string().min(1),
    PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),
    AUTH_SECRET: z.string().min(32),
    CSRF_SECRET: z.string().min(32),
    AUTH_OIDC_ISSUER: z.string().optional(),
    AUTH_OIDC_CLIENT_ID: z.string().optional(),
    AUTH_OIDC_CLIENT_SECRET: z.string().optional(),
    AUTH_OIDC_NAME: z.string().default('NIB SSO'),
    AUTH_OIDC_BACKEND_PROVIDER: z.string().default('oidc'),
    /** Public address of the NIB Digital Solutions website (canonical URLs, sitemap). Default: AUTH_URL. */
    SITE_URL: z.url().optional(),
    /** Same value as the backend's TELEGRAM_WEBHOOK_SECRET: Telegram sends it with every webhook call. */
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .regex(/^[A-Za-z0-9_-]{24,256}$/)
      .optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: bool.default(false),
  })
  .transform((env) => ({
    ...env,
    isProduction: env.NODE_ENV === 'production',
    keyRing: parseKeyRing(
      env.PAYLOAD_ENCRYPTION_KEYS,
      env.PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID,
    ) as KeyRing,
    oidcEnabled: !!(env.AUTH_OIDC_ISSUER && env.AUTH_OIDC_CLIENT_ID && env.AUTH_OIDC_CLIENT_SECRET),
  }));

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid AppCore frontend environment:\n${problems}`);
  }
  cached = result.data;
  return cached;
}
