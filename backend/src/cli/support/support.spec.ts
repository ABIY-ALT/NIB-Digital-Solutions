import { formatCell, Output, toJson } from '../kernel/output.js';
import { planCatalogueSync, isEmptyPlan, type CatalogueState } from './catalogue-sync.js';
import { adviseEnvironment } from './config-advice.js';
import { generateTemporaryPassword } from './passwords.js';
import { flatten, redactConfig } from './redact.js';

describe('adviseEnvironment', () => {
  const known = [
    'NODE_ENV',
    'JWT_ACCESS_SECRET',
    'MFA_SECRET_ENCRYPTION_KEY',
    'AUDIT_CHAIN_KEY',
    'DATABASE_URL',
    'SWAGGER_ENABLED',
  ];
  const base = {
    NODE_ENV: 'development',
    JWT_ACCESS_SECRET: 'jwt-key',
    MFA_SECRET_ENCRYPTION_KEY: 'mfa-key',
    AUDIT_CHAIN_KEY: 'audit-key',
  };
  const messages = (raw: Record<string, string>, fileKeys: string[] = []) =>
    adviseEnvironment(raw, known, fileKeys).map((f) => `${f.level} ${f.variable}: ${f.message}`);

  it('has nothing to say about a clean development environment', () => {
    expect(messages(base)).toEqual([]);
  });

  it('flags template placeholders, misspelt variables and reused keys', () => {
    const found = messages(
      { ...base, JWT_ACCESS_SECRET: '__GENERATE__base64', AUDIT_CHAIN_KEY: 'mfa-key' },
      ['JWT_ACESS_SECRET', 'NODE_ENV'],
    );
    expect(found).toContain(
      'error JWT_ACCESS_SECRET: still holds the template placeholder (run: npm run keys:generate)',
    );
    expect(found.find((m) => m.startsWith('warning JWT_ACESS_SECRET'))).toContain(
      'did you mean JWT_ACCESS_SECRET?',
    );
    expect(found).toContain(
      'error MFA_SECRET_ENCRYPTION_KEY: uses the same key material as AUDIT_CHAIN_KEY',
    );
  });

  it('reviews production for weak transport, development credentials and disabled controls', () => {
    const found = messages({
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:User%40123456@db.internal:5432/appcore',
      REDIS_URL: 'redis://cache.internal:6379/0',
      PAYLOAD_ENCRYPTION_MODE: 'optional',
      APPROVAL_ACTIONS: 'none',
      CORS_ORIGINS: 'http://app.nib.et,https://admin.nib.et',
    }).join('\n');
    expect(found).toContain('error DATABASE_URL: uses the documented development password');
    expect(found).toContain('DATABASE_URL: does not enforce TLS');
    expect(found).toContain('REDIS_URL: is not encrypted');
    expect(found).toContain('SWAGGER_ENABLED: the API documentation is served in production');
    expect(found).toContain('PAYLOAD_ENCRYPTION_MODE: is not "required"');
    expect(found).toContain('APPROVALS_ENABLED: maker–checker approval is switched off');
    expect(found).toContain('MFA_REQUIRED_ROLES: no role is required');
    expect(found).toContain('CORS_ORIGINS: http://app.nib.et is not HTTPS');
    expect(found).not.toContain('https://admin.nib.et is not HTTPS');
  });

  it('accepts a hardened production environment', () => {
    expect(
      messages({
        ...base,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://app:s3cret@db.internal:5432/appcore?sslmode=verify-full',
        REDIS_URL: 'rediss://cache.internal:6379/0',
        SWAGGER_ENABLED: 'false',
        PAYLOAD_ENCRYPTION_MODE: 'required',
        MFA_REQUIRED_ROLES: 'SUPER_ADMIN,ADMIN',
        CORS_ORIGINS: 'https://app.nib.et',
        PUBLIC_APP_URL: 'https://app.nib.et',
      }),
    ).toEqual([]);
  });
});

describe('planCatalogueSync', () => {
  const catalogue = { '*': 'Everything', 'users:read': 'Read users', 'loans:read': 'Read loans' };
  const roles = {
    SUPER_ADMIN: { name: 'Super', description: '', permissions: ['*'] },
    AUDITOR: { name: 'Auditor', description: '', permissions: ['users:read', 'loans:read'] },
  };
  const state: CatalogueState = {
    permissions: [
      { code: '*', description: 'Everything', deleted: false, roleCount: 1 },
      { code: 'users:read', description: 'Old text', deleted: false, roleCount: 1 },
      { code: 'legacy:used', description: null, deleted: false, roleCount: 2 },
      { code: 'legacy:unused', description: null, deleted: false, roleCount: 0 },
    ],
    roles: [{ code: 'AUDITOR', isSystem: true, permissions: ['users:read', 'legacy:used'] }],
  };

  it('creates what is missing and only reports the rest', () => {
    const plan = planCatalogueSync(catalogue, roles, state, { prune: false, resetRoles: false });
    expect(plan.createPermissions.map((p) => p.code)).toEqual(['loans:read']);
    expect(plan.updatePermissions.map((p) => p.code)).toEqual(['users:read']);
    expect(plan.createRoles.map((r) => r.code)).toEqual(['SUPER_ADMIN']);
    expect(plan.driftedRoles).toEqual([
      { code: 'AUDITOR', missing: ['loans:read'], extra: ['legacy:used'], reset: false },
    ]);
    expect(plan.orphanPermissions).toEqual([
      { code: 'legacy:used', roleCount: 2, pruned: false },
      { code: 'legacy:unused', roleCount: 0, pruned: false },
    ]);
  });

  it('prunes only orphans that no role uses, and resets roles only when asked', () => {
    const plan = planCatalogueSync(catalogue, roles, state, { prune: true, resetRoles: true });
    expect(plan.orphanPermissions.filter((p) => p.pruned).map((p) => p.code)).toEqual([
      'legacy:unused',
    ]);
    expect(plan.driftedRoles[0]!.reset).toBe(true);
  });

  it('restores a soft-deleted permission that is back in the catalogue', () => {
    const plan = planCatalogueSync(
      { 'users:read': 'Read users' },
      {},
      {
        permissions: [
          { code: 'users:read', description: 'Read users', deleted: true, roleCount: 0 },
        ],
        roles: [],
      },
      { prune: true, resetRoles: false },
    );
    expect(plan.createPermissions.map((p) => p.code)).toEqual(['users:read']);
    expect(plan.orphanPermissions).toEqual([]);
  });

  it('is empty when the database matches (drift alone changes nothing)', () => {
    const synced: CatalogueState = {
      permissions: Object.entries(catalogue).map(([code, description]) => ({
        code,
        description,
        deleted: false,
        roleCount: 1,
      })),
      roles: [
        { code: 'SUPER_ADMIN', isSystem: true, permissions: ['*'] },
        { code: 'AUDITOR', isSystem: true, permissions: ['users:read'] },
      ],
    };
    const plan = planCatalogueSync(catalogue, roles, synced, { prune: false, resetRoles: false });
    expect(plan.driftedRoles).toHaveLength(1);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('rejects a standard role that grants a permission missing from the catalogue', () => {
    expect(() =>
      planCatalogueSync(
        catalogue,
        { BROKEN: { name: 'x', description: '', permissions: ['ghost:read'] } },
        { permissions: [], roles: [] },
        { prune: false, resetRoles: false },
      ),
    ).toThrow(/BROKEN grants permissions that are not in the catalogue: ghost:read/);
  });
});

describe('redactConfig', () => {
  it('removes key material, secret maps, secret fields and URL passwords', () => {
    const redacted = redactConfig({
      database: { url: 'postgresql://postgres:User%40123456@localhost:5432/appcore', poolMax: 10 },
      auth: { issuer: 'appcore', accessTokenSecret: new Uint8Array(48) },
      mfa: { secretEncryptionKey: Buffer.alloc(32) },
      serviceAuth: { clients: new Map([['appcore-web', 'super-secret-value']]) },
      encryption: { keys: new Map([['k1', Buffer.alloc(32)]]), activeKeyId: 'k1' },
      integrations: { coreBanking: { apiKey: 'abc', baseUrl: 'https://t24.internal' } },
      security: { corsOrigins: ['http://localhost:3000'] },
    });
    const text = JSON.stringify(redacted);
    expect(text).not.toContain('User%40123456');
    expect(text).not.toContain('super-secret-value');
    expect(text).not.toContain('"abc"');
    expect(redacted).toMatchObject({
      database: { url: 'postgresql://postgres:****@localhost:5432/appcore', poolMax: 10 },
      auth: { issuer: 'appcore', accessTokenSecret: '[secret: 48 bytes]' },
      serviceAuth: { clients: { 'appcore-web': '[secret]' } },
      encryption: { keys: { k1: '[secret: 32 bytes]' }, activeKeyId: 'k1' },
      integrations: { coreBanking: { apiKey: '[secret]', baseUrl: 'https://t24.internal' } },
      security: { corsOrigins: ['http://localhost:3000'] },
    });
  });

  it('flattens nested sections into dotted keys', () => {
    expect(flatten({ a: { b: 1, c: { d: 'x' } }, e: [1, 2] })).toEqual([
      ['a.b', 1],
      ['a.c.d', 'x'],
      ['e', [1, 2]],
    ]);
  });
});

describe('generateTemporaryPassword', () => {
  const policy = {
    minLength: 10,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireDigit: true,
    requireSymbol: true,
  };

  it('always contains every character class and is never repeated', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword(policy);
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
      expect(password).not.toMatch(/[0O1lI]/);
      seen.add(password);
    }
    expect(seen.size).toBe(200);
  });

  it('follows a longer minimum length', () => {
    expect(generateTemporaryPassword({ ...policy, minLength: 24 })).toHaveLength(24);
  });
});

describe('Output', () => {
  const capture = (json: boolean) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const out = new Output(
      { stdout: { write: (c) => stdout.push(c) }, stderr: { write: (c) => stderr.push(c) } },
      { json, color: false },
    );
    return { out, stdout, stderr };
  };

  it('aligns tables and truncates long cells', () => {
    const { out, stdout } = capture(false);
    out.table(
      [
        { header: 'NAME', value: (r: { name: string; n: number }) => r.name, maxWidth: 6 },
        { header: 'N', value: (r) => r.n, align: 'right' },
      ],
      [
        { name: 'short', n: 5 },
        { name: 'much-too-long', n: 120 },
      ],
    );
    expect(stdout.join('')).toBe(
      ['  NAME      N', '  ──────  ───', '  short     5', '  much-…  120', ''].join('\n'),
    );
  });

  it('formats cells and serialises BigInt and Map', () => {
    expect(formatCell(null)).toBe('—');
    expect(formatCell(true)).toBe('yes');
    expect(formatCell(['a', 'b'])).toBe('a, b');
    expect(formatCell(new Date('2026-10-03T06:24:10.123Z'))).toBe('2026-10-03 06:24:10Z');
    expect(JSON.parse(toJson({ seq: 12n, keys: new Map([['k1', 1]]) }))).toEqual({
      seq: '12',
      keys: { k1: 1 },
    });
  });

  it('reserves stdout for the JSON document in --json mode', () => {
    const { out, stdout, stderr } = capture(true);
    out.heading('Progress');
    out.emit({ ok: true }, () => out.line('never printed'));
    expect(JSON.parse(stdout.join(''))).toEqual({ ok: true });
    expect(stderr.join('')).toContain('Progress');
  });
});
