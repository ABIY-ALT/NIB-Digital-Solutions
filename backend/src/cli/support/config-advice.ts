import { closest } from '../kernel/argv.js';

export interface ConfigFinding {
  level: 'error' | 'warning';
  variable: string;
  message: string;
}

type RawEnv = Readonly<Record<string, string | undefined>>;

const isTrue = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value === '' ? fallback : ['true', '1', 'yes'].includes(value);

const isLocalHost = (host: string): boolean =>
  ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** `id:secret,id2:secret2` → the secret parts. */
const pairSecrets = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((pair) => pair.slice(pair.indexOf(':') + 1).trim())
    .filter(Boolean);

const warning = (variable: string, message: string): ConfigFinding => ({
  level: 'warning',
  variable,
  message,
});

const error = (variable: string, message: string): ConfigFinding => ({
  level: 'error',
  variable,
  message,
});

/**
 * Review beyond the schema: settings that are VALID but wrong for the
 * environment. The schema says whether the application can start; this says
 * whether it should go live. Works on raw values, so it also runs when the
 * schema itself rejects the environment.
 */
export function adviseEnvironment(
  raw: RawEnv,
  knownVariables: readonly string[],
  fileKeys: readonly string[],
): ConfigFinding[] {
  // ── Every environment ────────────────────────────────────────────────────
  const findings = [
    ...placeholderFindings(raw, knownVariables),
    ...unknownVariableFindings(knownVariables, fileKeys),
    ...sharedKeyFindings(raw),
  ];
  if (!raw.AUDIT_CHAIN_KEY) {
    findings.push(
      warning(
        'AUDIT_CHAIN_KEY',
        'is not set: the audit chain key is derived from MFA_SECRET_ENCRYPTION_KEY. Set a dedicated key before go-live (changing it later invalidates existing seals)',
      ),
    );
  }

  if (raw.NODE_ENV !== 'production') return findings;

  // ── Production readiness ─────────────────────────────────────────────────
  return [
    ...findings,
    ...databaseFindings(raw),
    ...redisFindings(raw),
    ...controlFindings(raw),
    ...httpsFindings(raw),
  ];
}

function placeholderFindings(raw: RawEnv, knownVariables: readonly string[]): ConfigFinding[] {
  return Object.entries(raw)
    .filter(
      ([variable, value]) => value?.includes('__GENERATE__') && knownVariables.includes(variable),
    )
    .map(([variable]) =>
      error(variable, 'still holds the template placeholder (run: npm run keys:generate)'),
    );
}

function unknownVariableFindings(
  knownVariables: readonly string[],
  fileKeys: readonly string[],
): ConfigFinding[] {
  const known = new Set(knownVariables);
  return fileKeys
    .filter((variable) => !known.has(variable))
    .map((variable) => {
      const hint = closest(variable, knownVariables);
      const suggestion = hint ? ` (did you mean ${hint}?)` : '';
      return warning(variable, `is not a setting AppCore reads${suggestion} — it has no effect`);
    });
}

/** One key per purpose: a leak of one must not compromise the others. */
function sharedKeyFindings(raw: RawEnv): ConfigFinding[] {
  const material = new Map<string, string[]>();
  const track = (variable: string, value: string | undefined): void => {
    if (!value || value.includes('__GENERATE__')) return;
    material.set(value, [...(material.get(value) ?? []), variable]);
  };
  track('JWT_ACCESS_SECRET', raw.JWT_ACCESS_SECRET);
  track('MFA_SECRET_ENCRYPTION_KEY', raw.MFA_SECRET_ENCRYPTION_KEY);
  track('AUDIT_CHAIN_KEY', raw.AUDIT_CHAIN_KEY);
  for (const secret of pairSecrets(raw.PAYLOAD_ENCRYPTION_KEYS)) {
    track('PAYLOAD_ENCRYPTION_KEYS', secret);
  }
  for (const secret of pairSecrets(raw.SERVICE_CLIENTS)) track('SERVICE_CLIENTS', secret);
  const findings: ConfigFinding[] = [];
  for (const variables of material.values()) {
    const distinct = [...new Set(variables)];
    if (distinct.length > 1) {
      findings.push(
        error(distinct[0]!, `uses the same key material as ${distinct.slice(1).join(', ')}`),
      );
    }
  }
  return findings;
}

function databaseFindings(raw: RawEnv): ConfigFinding[] {
  const database = parseUrl(raw.DATABASE_URL);
  if (!database) return [];
  const findings: ConfigFinding[] = [];
  if (decodeURIComponent(database.password) === 'User@123456') {
    findings.push(error('DATABASE_URL', 'uses the documented development password'));
  }
  if (
    !isLocalHost(database.hostname) &&
    !/sslmode=(require|verify-ca|verify-full)/.test(database.search)
  ) {
    findings.push(warning('DATABASE_URL', 'does not enforce TLS (add sslmode=verify-full)'));
  }
  return findings;
}

function redisFindings(raw: RawEnv): ConfigFinding[] {
  const redis = parseUrl(raw.REDIS_URL);
  if (redis?.protocol === 'redis:' && !isLocalHost(redis.hostname)) {
    return [warning('REDIS_URL', 'is not encrypted (use rediss://): it carries session data')];
  }
  return [];
}

/** Valid settings that switch a production safeguard off. */
function controlFindings(raw: RawEnv): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  if (isTrue(raw.SWAGGER_ENABLED, true)) {
    findings.push(
      warning('SWAGGER_ENABLED', 'the API documentation is served in production (set false)'),
    );
  }
  if ((raw.PAYLOAD_ENCRYPTION_MODE ?? 'optional') !== 'required') {
    findings.push(
      warning('PAYLOAD_ENCRYPTION_MODE', 'is not "required": unencrypted payloads are accepted'),
    );
  }
  if (['debug', 'trace'].includes(raw.LOG_LEVEL ?? '')) {
    findings.push(warning('LOG_LEVEL', `"${raw.LOG_LEVEL}" is verbose for production (use info)`));
  }
  if (!isTrue(raw.APPROVALS_ENABLED, true) || raw.APPROVAL_ACTIONS?.trim() === 'none') {
    findings.push(warning('APPROVALS_ENABLED', 'maker–checker approval is switched off'));
  }
  if (!raw.MFA_REQUIRED_ROLES?.trim()) {
    findings.push(
      warning('MFA_REQUIRED_ROLES', 'no role is required to use two-step verification'),
    );
  }
  if (isTrue(raw.OIDC_AUTO_PROVISION, false)) {
    findings.push(
      warning('OIDC_AUTO_PROVISION', 'accounts are created automatically at first single sign-on'),
    );
  }
  if (raw.TRUST_PROXY === 'true') {
    findings.push(
      warning('TRUST_PROXY', '"true" trusts every proxy: client IP addresses can be forged'),
    );
  }
  return findings;
}

function httpsFindings(raw: RawEnv): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  for (const [variable, value] of [
    ['PUBLIC_APP_URL', raw.PUBLIC_APP_URL],
    ...(raw.CORS_ORIGINS ?? '').split(',').map((origin) => ['CORS_ORIGINS', origin.trim()]),
  ] as Array<[string, string | undefined]>) {
    const url = parseUrl(value);
    if (url?.protocol === 'http:' && !isLocalHost(url.hostname)) {
      findings.push(warning(variable, `${value} is not HTTPS`));
    }
  }
  return findings;
}
