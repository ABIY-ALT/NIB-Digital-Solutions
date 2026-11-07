import { z } from 'zod';

/**
 * Environment contract for the AppCore backend.
 *
 * Every variable is validated at startup (principle 8). If anything required is
 * missing or malformed the process exits before it opens a port.
 */

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Decodes a base64 string and requires a minimum byte length. */
const base64Secret = (minBytes: number) =>
  z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, 'base64').length >= minBytes, {
      message: `must be base64 encoding of at least ${minBytes} random bytes`,
    });

/** `id:secret,id2:secret2` → Map<id, secret> */
const serviceClients = z.string().transform((value, ctx) => {
  const clients = new Map<string, string>();
  for (const pair of value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const idx = pair.indexOf(':');
    const id = pair.slice(0, idx).trim();
    const secret = pair.slice(idx + 1).trim();
    if (idx <= 0 || secret.length < 32) {
      ctx.addIssue({
        code: 'custom',
        message: 'SERVICE_CLIENTS entries must be "<clientId>:<secret>" with a secret of 32+ chars',
      });
      return z.NEVER;
    }
    clients.set(id, secret);
  }
  return clients;
});

/** `kid:base64key,kid2:base64key2` → Map<kid, Buffer(32)> */
const encryptionKeyRing = z.string().transform((value, ctx) => {
  const keys = new Map<string, Buffer>();
  for (const pair of value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const idx = pair.indexOf(':');
    const kid = pair.slice(0, idx).trim();
    const key = Buffer.from(pair.slice(idx + 1).trim(), 'base64');
    if (idx <= 0 || key.length !== 32) {
      ctx.addIssue({
        code: 'custom',
        message: 'PAYLOAD_ENCRYPTION_KEYS entries must be "<kid>:<base64 of exactly 32 bytes>"',
      });
      return z.NEVER;
    }
    keys.set(kid, key);
  }
  return keys;
});

const envFields = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('appcore-backend'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().min(1).default('api'),
  API_DEFAULT_VERSION: z.string().min(1).default('1'),
  TRUST_PROXY: z.string().default('loopback'),
  BODY_LIMIT: z.string().default('1mb'),
  /** Browser-facing URL of the product (links in e-mails). */
  PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  /** Sender address of every e-mail (the display name comes from the "mail.fromName" setting). */
  MAIL_FROM: z.string().default('NIB Digital Solutions <no-reply@nib.et>'),
  /** `log` writes e-mails to the log (development); `smtp` sends them. */
  MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /** true = implicit TLS (port 465); false = STARTTLS (port 587). */
  SMTP_SECURE: bool.default(false),
  /** With STARTTLS: refuse to send if the server does not offer encryption. */
  SMTP_REQUIRE_TLS: bool.default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** false accepts a certificate from a private CA (internal relays). Never for public hosts. */
  SMTP_TLS_REJECT_UNAUTHORIZED: bool.default(true),
  SMTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: bool.default(false),
  /** Where log lines go. The CLI uses stderr so stdout carries only command output. */
  LOG_STREAM: z.enum(['stdout', 'stderr']).default('stdout'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
  /**
   * Longest an interactive transaction may stay open (Prisma's default: 5 s).
   * The CLI raises it, since an operator's machine may be far from the database.
   */
  DATABASE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(5_000),

  /**
   * Backing store for sessions, cache, idempotency, rate limits and MFA challenges.
   * `memory` is a single-process store for local development without Redis.
   * Production requires `redis`.
   */
  KV_STORE: z.enum(['redis', 'memory']).default('redis'),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
  REDIS_KEY_PREFIX: z.string().default('appcore:'),

  JWT_ISSUER: z.string().min(1).default('appcore-backend'),
  JWT_AUDIENCE: z.string().min(1).default('appcore-bff'),
  JWT_ACCESS_SECRET: base64Secret(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(28_800),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(120).default(15),
  SESSION_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).default(1_800),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  /** Self-service "forgot password" by e-mailed link. */
  PASSWORD_RESET_ENABLED: bool.default(true),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  /** Minutes before another reset e-mail is sent for the same account. */
  PASSWORD_RESET_COOLDOWN_MINUTES: z.coerce.number().int().min(0).max(60).default(2),

  MFA_ISSUER: z.string().min(1).default('NIB Digital Solutions'),
  MFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  MFA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  MFA_SECRET_ENCRYPTION_KEY: base64Secret(32),

  OIDC_ENABLED: bool.default(false),
  OIDC_PROVIDER_NAME: z.string().min(1).default('oidc'),
  OIDC_ISSUER: z.string().optional(),
  OIDC_AUDIENCE: z.string().optional(),
  OIDC_JWKS_URI: z.string().optional(),
  OIDC_AUTO_PROVISION: bool.default(false),

  CORS_ORIGINS: csv.default([]),

  SERVICE_AUTH_ENABLED: bool.default(true),
  SERVICE_CLIENTS: serviceClients,
  SERVICE_AUTH_MAX_SKEW_SECONDS: z.coerce.number().int().min(5).max(900).default(300),

  PAYLOAD_ENCRYPTION_MODE: z.enum(['disabled', 'optional', 'required']).default('optional'),
  PAYLOAD_ENCRYPTION_KEYS: encryptionKeyRing,
  PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),

  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  AUTH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

  CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().min(1).default(300),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(60).default(86_400),

  SWAGGER_ENABLED: bool.default(true),
  SWAGGER_PATH: z.string().min(1).default('docs'),

  // ── Digital Solutions marketplace ───────────────────────────────────────
  /** Claude API key for the grounded product assistant. Unset: the website uses its on-device catalog assistant. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  MARKETPLACE_ASSISTANT_MODEL: z.string().min(1).default('claude-opus-5-5'),
  /** Largest uploaded product image (bytes). Keep below BODY_LIMIT after base64 (≈ ×1.37). */
  MARKETPLACE_MEDIA_MAX_BYTES: z.coerce.number().int().min(10_000).max(20_000_000).default(700_000),
  /**
   * Secret mixed into hashes of visitor IPs and voter tokens (ideas board, questions),
   * so they can be compared but not reversed. Set it in production; unset, a key
   * derived from AUDIT_CHAIN_KEY (or a development constant) is used.
   */
  MARKETPLACE_PRIVACY_SALT: z.string().min(16).optional(),

  // ── Telegram bot (developer notifications and replies) ───────────────────
  /** Bot token from @BotFather. Server-side only: never sent to the browser. */
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d+:[\w-]{30,}$/, 'Expected a token from @BotFather')
    .optional(),
  /** The bot's username without @ (deep links for linking developer accounts). */
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^\w{5,64}$/)
    .optional(),
  /**
   * off: no Telegram (questions are e-mailed to developers instead).
   * polling: the backend fetches updates (development, no public URL needed).
   * webhook: Telegram posts updates to PUBLIC_APP_URL/api/telegram/webhook.
   */
  TELEGRAM_MODE: z.enum(['off', 'polling', 'webhook']).default('off'),
  /** Secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token on every webhook call. */
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{24,256}$/, 'Use 24+ letters, digits, _ or -')
    .optional(),

  CORE_BANKING_ADAPTER: z.enum(['mock', 't24']).default('mock'),
  CORE_BANKING_BASE_URL: z.string().optional(),
  CORE_BANKING_API_KEY: z.string().optional(),
  CORE_BANKING_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),

  // ── Account security policy ────────────────────────────────────────────────
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(64).default(10),
  PASSWORD_REQUIRE_UPPERCASE: bool.default(true),
  PASSWORD_REQUIRE_LOWERCASE: bool.default(true),
  PASSWORD_REQUIRE_DIGIT: bool.default(true),
  PASSWORD_REQUIRE_SYMBOL: bool.default(true),
  /** Previous passwords that cannot be reused (0 = only the current one). */
  PASSWORD_HISTORY_COUNT: z.coerce.number().int().min(0).max(24).default(5),
  /** Days before a password expires and must be changed at sign-in (0 = never). */
  PASSWORD_MAX_AGE_DAYS: z.coerce.number().int().min(0).max(3650).default(90),
  /** Hours a new password must be kept before it can be changed again (0 = off). */
  PASSWORD_MIN_AGE_HOURS: z.coerce.number().int().min(0).max(720).default(0),
  PASSWORD_EXPIRY_WARNING_DAYS: z.coerce.number().int().min(0).max(90).default(14),
  /** Passwords set by an administrator (new user, reset) are temporary. */
  PASSWORD_CHANGE_ON_FIRST_LOGIN: bool.default(true),
  /** Concurrent sessions per user; the oldest is ended when exceeded (0 = unlimited). */
  SESSION_MAX_CONCURRENT: z.coerce.number().int().min(0).max(50).default(3),
  /** Roles that must use two-step verification (users are reminded until enrolled). */
  MFA_REQUIRED_ROLES: csv.default([]),
  /** Notify users of sign-ins from a device/network not seen in the last 90 days. */
  NEW_DEVICE_ALERTS: bool.default(true),

  // ── Maker–checker approvals ────────────────────────────────────────────────
  APPROVALS_ENABLED: bool.default(true),
  /** Actions that need a second person's approval ("none" disables all). */
  APPROVAL_ACTIONS: csv.default(['roles.create', 'roles.update', 'roles.delete', 'users.delete']),
  APPROVAL_EXPIRY_HOURS: z.coerce.number().int().min(1).max(2160).default(72),

  // ── Tamper-evident audit & data retention ──────────────────────────────────
  /** HMAC key for the audit hash chain (base64, 32+ bytes). Required in production. */
  AUDIT_CHAIN_KEY: z.preprocess((v) => (v === '' ? undefined : v), base64Secret(32).optional()),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).default(2555),
  NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().min(7).default(180),
  APPROVAL_RETENTION_DAYS: z.coerce.number().int().min(30).default(730),
  RETENTION_ENABLED: bool.default(true),
  RETENTION_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  RETENTION_BATCH_SIZE: z.coerce.number().int().min(10).max(10_000).default(500),
  /** Where purged records are archived (JSON Lines, one file per run and dataset). */
  ARCHIVE_DIR: z.string().min(1).default('storage/archive'),

  /** Background jobs (retention, expiry, anchoring). Disable for tests / CLI tools. */
  JOBS_ENABLED: bool.default(true),
});

type EnvFields = z.output<typeof envFields>;
type EnvContext = z.RefinementCtx<EnvFields>;

/** Settings that only make sense together. */
function checkDependencies(env: EnvFields, ctx: EnvContext): void {
  if (!env.PAYLOAD_ENCRYPTION_KEYS.has(env.PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID)) {
    ctx.addIssue({
      code: 'custom',
      path: ['PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID'],
      message: 'must reference a key id present in PAYLOAD_ENCRYPTION_KEYS',
    });
  }
  if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
    ctx.addIssue({
      code: 'custom',
      path: ['SMTP_HOST'],
      message: 'is required when MAIL_TRANSPORT=smtp',
    });
  }
  if (env.SERVICE_CLIENTS.size === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['SERVICE_CLIENTS'],
      message: 'at least one client is required',
    });
  }
  if (env.OIDC_ENABLED && (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE)) {
    ctx.addIssue({
      code: 'custom',
      path: ['OIDC_ISSUER'],
      message: 'OIDC_ISSUER and OIDC_AUDIENCE are required when OIDC_ENABLED=true',
    });
  }
  if (env.CORE_BANKING_ADAPTER === 't24' && !env.CORE_BANKING_BASE_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORE_BANKING_BASE_URL'],
      message: 'required when CORE_BANKING_ADAPTER=t24',
    });
  }
  if (env.KV_STORE === 'redis' && !env.REDIS_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['REDIS_URL'],
      message: 'required when KV_STORE=redis',
    });
  }
}

/** Production runs on durable, locked-down settings only. */
function checkProduction(env: EnvFields, ctx: EnvContext): void {
  if (env.KV_STORE !== 'redis') {
    ctx.addIssue({
      code: 'custom',
      path: ['KV_STORE'],
      message: 'must be "redis" in production (memory store is single-process and non-durable)',
    });
  }
  if (!env.SERVICE_AUTH_ENABLED) {
    ctx.addIssue({
      code: 'custom',
      path: ['SERVICE_AUTH_ENABLED'],
      message: 'must be true in production',
    });
  }
  if (env.CORS_ORIGINS.length === 0 || env.CORS_ORIGINS.includes('*')) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ORIGINS'],
      message: 'must list explicit BFF origins in production',
    });
  }
  if (!env.AUDIT_CHAIN_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['AUDIT_CHAIN_KEY'],
      message: 'is required in production (dedicated key for the tamper-evident audit chain)',
    });
  }
  if (env.LOG_PRETTY) {
    ctx.addIssue({
      code: 'custom',
      path: ['LOG_PRETTY'],
      message: 'must be false in production',
    });
  }
}

export const envSchema = envFields.superRefine((env, ctx) => {
  checkDependencies(env, ctx);
  if (env.NODE_ENV === 'production') checkProduction(env, ctx);
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates raw environment variables. Throws a readable error listing every
 * problem, which aborts Nest bootstrap.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid AppCore backend configuration:\n${problems}`);
  }
  return result.data;
}
