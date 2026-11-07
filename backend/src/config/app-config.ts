import { hkdfSync, createHash } from 'node:crypto';
import type { Env } from './env.schema.js';

/**
 * Typed configuration grouped by concern. Features depend on the slice they need
 * (`config.auth`, `config.redis`, ...) instead of reading process.env directly.
 */
export interface AppConfig {
  app: {
    env: Env['NODE_ENV'];
    name: string;
    port: number;
    apiPrefix: string;
    defaultVersion: string;
    trustProxy: string;
    bodyLimit: string;
    isProduction: boolean;
    publicUrl: string;
  };
  mail: {
    transport: Env['MAIL_TRANSPORT'];
    /** `Name <address>`; the address is what the server is allowed to send as. */
    from: string;
    smtp: {
      host?: string;
      port: number;
      secure: boolean;
      requireTls: boolean;
      user?: string;
      password?: string;
      rejectUnauthorized: boolean;
      timeoutMs: number;
    };
  };
  logging: { level: Env['LOG_LEVEL']; pretty: boolean; stream: Env['LOG_STREAM'] };
  database: { url: string; poolMax: number; transactionTimeoutMs: number };
  kvStore: { driver: Env['KV_STORE']; redisUrl?: string; keyPrefix: string };
  auth: {
    issuer: string;
    audience: string;
    accessTokenSecret: Uint8Array;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    refreshReuseGraceSeconds: number;
    sessionIdleTimeoutSeconds: number;
    maxFailedAttempts: number;
    lockoutMinutes: number;
    passwordReset: { enabled: boolean; ttlSeconds: number; cooldownSeconds: number };
  };
  mfa: {
    issuer: string;
    challengeTtlSeconds: number;
    maxAttempts: number;
    secretEncryptionKey: Buffer;
  };
  oidc: {
    enabled: boolean;
    providerName: string;
    issuer?: string;
    audience?: string;
    jwksUri?: string;
    autoProvision: boolean;
  };
  security: {
    corsOrigins: string[];
    rateLimit: { ttlSeconds: number; max: number };
    authRateLimit: { ttlSeconds: number; max: number };
  };
  serviceAuth: {
    enabled: boolean;
    clients: ReadonlyMap<string, string>;
    maxSkewSeconds: number;
    /** Paths that do not require a BFF service signature (probes, docs). */
    exemptPathPrefixes: string[];
  };
  encryption: {
    mode: Env['PAYLOAD_ENCRYPTION_MODE'];
    keys: ReadonlyMap<string, Buffer>;
    activeKeyId: string;
  };
  cache: { defaultTtlSeconds: number };
  idempotency: { ttlSeconds: number };
  docs: { enabled: boolean; path: string };
  securityPolicy: {
    password: {
      minLength: number;
      maxLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireDigit: boolean;
      requireSymbol: boolean;
      historyCount: number;
      maxAgeDays: number;
      minAgeHours: number;
      expiryWarningDays: number;
      changeOnFirstLogin: boolean;
    };
    session: { maxConcurrent: number; newDeviceAlerts: boolean };
    mfa: { requiredRoles: string[] };
  };
  approvals: { enabled: boolean; actions: string[]; expiryHours: number };
  audit: { chainKey: Buffer; chainKeyDerived: boolean };
  retention: {
    enabled: boolean;
    intervalHours: number;
    batchSize: number;
    archiveDir: string;
    auditDays: number;
    notificationDays: number;
    approvalDays: number;
  };
  jobs: { enabled: boolean };
  marketplace: {
    anthropicApiKey: string | undefined;
    assistantModel: string;
    mediaMaxBytes: number;
    /** Secret for hashing visitor IPs and voter tokens. */
    privacySalt: string;
  };
  telegram: {
    mode: 'off' | 'polling' | 'webhook';
    botToken: string | undefined;
    botUsername: string | undefined;
    webhookSecret: string | undefined;
  };
  integrations: {
    coreBanking: {
      adapter: Env['CORE_BANKING_ADAPTER'];
      baseUrl?: string;
      apiKey?: string;
      timeoutMs: number;
    };
  };
}

export function buildAppConfig(env: Env): AppConfig {
  return {
    app: {
      env: env.NODE_ENV,
      name: env.APP_NAME,
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      defaultVersion: env.API_DEFAULT_VERSION,
      trustProxy: env.TRUST_PROXY,
      bodyLimit: env.BODY_LIMIT,
      isProduction: env.NODE_ENV === 'production',
      publicUrl: env.PUBLIC_APP_URL.replace(/\/$/, ''),
    },
    mail: {
      transport: env.MAIL_TRANSPORT,
      from: env.MAIL_FROM,
      smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        requireTls: env.SMTP_REQUIRE_TLS,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        rejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
        timeoutMs: env.SMTP_TIMEOUT_MS,
      },
    },
    logging: { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, stream: env.LOG_STREAM },
    database: {
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      transactionTimeoutMs: env.DATABASE_TRANSACTION_TIMEOUT_MS,
    },
    kvStore: { driver: env.KV_STORE, redisUrl: env.REDIS_URL, keyPrefix: env.REDIS_KEY_PREFIX },
    auth: {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTokenSecret: new Uint8Array(Buffer.from(env.JWT_ACCESS_SECRET, 'base64')),
      accessTokenTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
      refreshReuseGraceSeconds: env.REFRESH_REUSE_GRACE_SECONDS,
      sessionIdleTimeoutSeconds: env.SESSION_IDLE_TIMEOUT_SECONDS,
      maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
      lockoutMinutes: env.AUTH_LOCKOUT_MINUTES,
      passwordReset: {
        enabled: env.PASSWORD_RESET_ENABLED,
        ttlSeconds: env.PASSWORD_RESET_TTL_MINUTES * 60,
        cooldownSeconds: env.PASSWORD_RESET_COOLDOWN_MINUTES * 60,
      },
    },
    mfa: {
      issuer: env.MFA_ISSUER,
      challengeTtlSeconds: env.MFA_CHALLENGE_TTL_SECONDS,
      maxAttempts: env.MFA_MAX_ATTEMPTS,
      secretEncryptionKey: Buffer.from(env.MFA_SECRET_ENCRYPTION_KEY, 'base64').subarray(0, 32),
    },
    oidc: {
      enabled: env.OIDC_ENABLED,
      providerName: env.OIDC_PROVIDER_NAME,
      issuer: env.OIDC_ISSUER,
      audience: env.OIDC_AUDIENCE,
      jwksUri: env.OIDC_JWKS_URI,
      autoProvision: env.OIDC_AUTO_PROVISION,
    },
    security: {
      corsOrigins: env.CORS_ORIGINS,
      rateLimit: { ttlSeconds: env.RATE_LIMIT_TTL_SECONDS, max: env.RATE_LIMIT_MAX },
      authRateLimit: { ttlSeconds: env.AUTH_RATE_LIMIT_TTL_SECONDS, max: env.AUTH_RATE_LIMIT_MAX },
    },
    serviceAuth: {
      enabled: env.SERVICE_AUTH_ENABLED,
      clients: env.SERVICE_CLIENTS,
      maxSkewSeconds: env.SERVICE_AUTH_MAX_SKEW_SECONDS,
      exemptPathPrefixes: ['/health', `/${env.SWAGGER_PATH}`],
    },
    encryption: {
      mode: env.PAYLOAD_ENCRYPTION_MODE,
      keys: env.PAYLOAD_ENCRYPTION_KEYS,
      activeKeyId: env.PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID,
    },
    cache: { defaultTtlSeconds: env.CACHE_DEFAULT_TTL_SECONDS },
    idempotency: { ttlSeconds: env.IDEMPOTENCY_TTL_SECONDS },
    docs: { enabled: env.SWAGGER_ENABLED, path: env.SWAGGER_PATH },
    securityPolicy: {
      password: {
        minLength: env.PASSWORD_MIN_LENGTH,
        maxLength: 128,
        requireUppercase: env.PASSWORD_REQUIRE_UPPERCASE,
        requireLowercase: env.PASSWORD_REQUIRE_LOWERCASE,
        requireDigit: env.PASSWORD_REQUIRE_DIGIT,
        requireSymbol: env.PASSWORD_REQUIRE_SYMBOL,
        historyCount: env.PASSWORD_HISTORY_COUNT,
        maxAgeDays: env.PASSWORD_MAX_AGE_DAYS,
        minAgeHours: env.PASSWORD_MIN_AGE_HOURS,
        expiryWarningDays: env.PASSWORD_EXPIRY_WARNING_DAYS,
        changeOnFirstLogin: env.PASSWORD_CHANGE_ON_FIRST_LOGIN,
      },
      session: {
        maxConcurrent: env.SESSION_MAX_CONCURRENT,
        newDeviceAlerts: env.NEW_DEVICE_ALERTS,
      },
      mfa: { requiredRoles: env.MFA_REQUIRED_ROLES },
    },
    approvals: {
      enabled: env.APPROVALS_ENABLED,
      actions: env.APPROVAL_ACTIONS.includes('none') ? [] : env.APPROVAL_ACTIONS,
      expiryHours: env.APPROVAL_EXPIRY_HOURS,
    },
    audit: auditChainKey(env),
    retention: {
      enabled: env.RETENTION_ENABLED,
      intervalHours: env.RETENTION_INTERVAL_HOURS,
      batchSize: env.RETENTION_BATCH_SIZE,
      archiveDir: env.ARCHIVE_DIR,
      auditDays: env.AUDIT_RETENTION_DAYS,
      notificationDays: env.NOTIFICATION_RETENTION_DAYS,
      approvalDays: env.APPROVAL_RETENTION_DAYS,
    },
    jobs: { enabled: env.JOBS_ENABLED && env.NODE_ENV !== 'test' },
    marketplace: {
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      assistantModel: env.MARKETPLACE_ASSISTANT_MODEL,
      mediaMaxBytes: env.MARKETPLACE_MEDIA_MAX_BYTES,
      privacySalt:
        env.MARKETPLACE_PRIVACY_SALT ??
        createHash('sha256')
          .update(`appcore-marketplace-privacy:${env.AUDIT_CHAIN_KEY ?? env.NODE_ENV}`)
          .digest('hex'),
    },
    // Telegram needs a token; without one the mode is "off" whatever was configured.
    telegram: {
      mode: env.TELEGRAM_BOT_TOKEN ? env.TELEGRAM_MODE : 'off',
      botToken: env.TELEGRAM_BOT_TOKEN,
      botUsername: env.TELEGRAM_BOT_USERNAME,
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    },
    integrations: {
      coreBanking: {
        adapter: env.CORE_BANKING_ADAPTER,
        baseUrl: env.CORE_BANKING_BASE_URL,
        apiKey: env.CORE_BANKING_API_KEY,
        timeoutMs: env.CORE_BANKING_TIMEOUT_MS,
      },
    },
  };
}

/**
 * Audit chain key. Outside production a missing AUDIT_CHAIN_KEY is derived
 * (HKDF) from the MFA encryption key so development works out of the box;
 * production requires a dedicated key (enforced by the env schema).
 */
function auditChainKey(env: Env): AppConfig['audit'] {
  if (env.AUDIT_CHAIN_KEY) {
    return { chainKey: Buffer.from(env.AUDIT_CHAIN_KEY, 'base64'), chainKeyDerived: false };
  }
  const derived = hkdfSync(
    'sha256',
    Buffer.from(env.MFA_SECRET_ENCRYPTION_KEY, 'base64'),
    Buffer.alloc(0),
    'appcore-audit-chain-v1',
    32,
  );
  return { chainKey: Buffer.from(derived), chainKeyDerived: true };
}
