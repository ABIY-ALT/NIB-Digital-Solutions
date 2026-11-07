import { describe, expect, it } from 'vitest';
import { envSchema, validateEnv } from './env.schema.js';

const secret = Buffer.alloc(32, 1).toString('base64');

/** The smallest valid development environment. */
const base = {
  DATABASE_URL: 'postgresql://app@localhost:5432/appcore',
  JWT_ACCESS_SECRET: secret,
  MFA_SECRET_ENCRYPTION_KEY: secret,
  SERVICE_CLIENTS: `bff:${'s'.repeat(32)}`,
  PAYLOAD_ENCRYPTION_KEYS: `k1:${secret}`,
  PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  KV_STORE: 'memory',
};

/** Paths of the problems the schema reports. */
const problems = (raw: Record<string, unknown>) => {
  const result = envSchema.safeParse(raw);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('envSchema', () => {
  it('accepts a minimal development environment with defaults', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SERVICE_CLIENTS.get('bff')).toHaveLength(32);
    expect(env.PAYLOAD_ENCRYPTION_KEYS.get('k1')).toHaveLength(32);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('parses booleans, lists and an empty audit key', () => {
    const env = validateEnv({
      ...base,
      LOG_PRETTY: 'yes',
      SMTP_SECURE: '1',
      CORS_ORIGINS: 'http://a, http://b,',
      AUDIT_CHAIN_KEY: '',
    });
    expect(env.LOG_PRETTY).toBe(true);
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://a', 'http://b']);
    expect(env.AUDIT_CHAIN_KEY).toBeUndefined();
  });

  it('rejects malformed service clients and key rings', () => {
    expect(problems({ ...base, SERVICE_CLIENTS: 'bff:short' })).toContain('SERVICE_CLIENTS');
    expect(problems({ ...base, SERVICE_CLIENTS: `:${'s'.repeat(32)}` })).toContain(
      'SERVICE_CLIENTS',
    );
    expect(problems({ ...base, PAYLOAD_ENCRYPTION_KEYS: 'k1:c2hvcnQ=' })).toContain(
      'PAYLOAD_ENCRYPTION_KEYS',
    );
    expect(problems({ ...base, JWT_ACCESS_SECRET: 'c2hvcnQ=' })).toContain('JWT_ACCESS_SECRET');
  });

  it('checks settings that only make sense together', () => {
    expect(
      problems({
        ...base,
        SERVICE_CLIENTS: ' , ',
        PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID: 'k2',
        MAIL_TRANSPORT: 'smtp',
        OIDC_ENABLED: 'true',
        OIDC_ISSUER: 'https://idp',
        CORE_BANKING_ADAPTER: 't24',
        KV_STORE: 'redis',
      }),
    ).toEqual([
      'PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID',
      'SMTP_HOST',
      'SERVICE_CLIENTS',
      'OIDC_ISSUER',
      'CORE_BANKING_BASE_URL',
      'REDIS_URL',
    ]);
    expect(
      problems({
        ...base,
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'mail',
        OIDC_ENABLED: 'true',
        OIDC_ISSUER: 'https://idp',
        OIDC_AUDIENCE: 'appcore',
        CORE_BANKING_ADAPTER: 't24',
        CORE_BANKING_BASE_URL: 'https://t24',
        KV_STORE: 'redis',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toEqual([]);
  });

  it('requires durable, locked-down settings in production', () => {
    expect(
      problems({
        ...base,
        NODE_ENV: 'production',
        SERVICE_AUTH_ENABLED: 'false',
        CORS_ORIGINS: '*',
        LOG_PRETTY: 'true',
      }),
    ).toEqual([
      'KV_STORE',
      'SERVICE_AUTH_ENABLED',
      'CORS_ORIGINS',
      'AUDIT_CHAIN_KEY',
      'LOG_PRETTY',
    ]);
    expect(problems({ ...base, NODE_ENV: 'production' })).toContain('CORS_ORIGINS');
    expect(
      problems({
        ...base,
        NODE_ENV: 'production',
        KV_STORE: 'redis',
        REDIS_URL: 'rediss://cache:6380',
        CORS_ORIGINS: 'https://app.example.com',
        AUDIT_CHAIN_KEY: secret,
      }),
    ).toEqual([]);
  });

  it('lists every problem in one readable error', () => {
    expect(() => validateEnv({})).toThrow(
      /Invalid AppCore backend configuration:\n {2}• DATABASE_URL/,
    );
  });
});
