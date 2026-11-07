import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { closest } from '../kernel/argv';
import { UsageError } from '../kernel/errors';

export interface EnvFinding {
  level: 'error' | 'warning';
  variable: string;
  message: string;
}

export type RawEnv = Readonly<Record<string, string | undefined>>;

export interface LoadedEnvironment {
  raw: Record<string, string | undefined>;
  /** Variables read from files (typos can only be detected there). */
  fileKeys: string[];
  sources: string[];
}

/** Read by Next.js / Auth.js rather than by the AppCore schema. */
const FRAMEWORK_VARIABLES = ['AUTH_URL', 'AUTH_TRUST_HOST', 'NEXTAUTH_URL', 'PORT', 'HOSTNAME'];

export function readEnvFile(path: string): Record<string, string> {
  return parseEnv(readFileSync(path, 'utf8')) as Record<string, string>;
}

/**
 * The environment as Next.js would load it (process › .env.<mode>.local ›
 * .env.local › .env.<mode> › .env) — or, with `envFile`, ONLY that file, so a
 * production file can be checked from any machine.
 */
export function loadEnvironment(options: {
  root: string;
  envFile?: string;
  processEnv?: NodeJS.ProcessEnv;
}): LoadedEnvironment {
  if (options.envFile) {
    const path = resolve(options.root, options.envFile);
    if (!existsSync(path)) throw new UsageError(`Environment file not found: ${path}`);
    const values = readEnvFile(path);
    return { raw: { ...values }, fileKeys: Object.keys(values), sources: [path] };
  }
  const processEnv = options.processEnv ?? process.env;
  const mode = processEnv.NODE_ENV ?? 'development';
  const fromFiles: Record<string, string> = {};
  const sources: string[] = [];
  for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
    const path = resolve(options.root, file);
    if (!existsSync(path)) continue;
    sources.push(file);
    for (const [key, value] of Object.entries(readEnvFile(path))) fromFiles[key] ??= value;
  }
  sources.push('process environment');
  return { raw: { ...fromFiles, ...processEnv }, fileKeys: Object.keys(fromFiles), sources };
}

/** Short, non-reversible identifier of a secret: lets two people compare values without showing them. */
export const fingerprint = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex').slice(0, 8);

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

/** `id:value,id2:value2` → Map<id, value>. */
function pairs(value: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (value ?? '').split(',')) {
    const index = pair.indexOf(':');
    if (index > 0) map.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  return map;
}

const finding = (level: EnvFinding['level'], variable: string, message: string): EnvFinding => ({
  level,
  variable,
  message,
});

/**
 * Review beyond the schema: values that are valid but wrong. The schema says
 * whether the BFF can start; this says whether it is configured safely.
 */
export function reviewEnvironment(
  raw: RawEnv,
  knownVariables: readonly string[],
  fileKeys: readonly string[],
): EnvFinding[] {
  const known = new Set([...knownVariables, ...FRAMEWORK_VARIABLES]);
  const findings = [
    ...fileKeys.flatMap((variable) => fileVariableFindings(variable, raw[variable], known)),
    ...sharedSecretFindings(raw),
    ...singleSignOnSetupFindings(raw),
  ];
  if (raw.NODE_ENV !== 'production') return findings;
  return [...findings, ...productionFindings(raw)];
}

/** A variable from an env file: a leftover placeholder, a public secret or an unknown name. */
function fileVariableFindings(
  variable: string,
  value: string | undefined,
  known: ReadonlySet<string>,
): EnvFinding[] {
  const findings: EnvFinding[] = [];
  if (value?.includes('__GENERATE__')) {
    findings.push(
      finding(
        'error',
        variable,
        'still holds the template placeholder (run: npm run keys:generate in backend/)',
      ),
    );
  }
  if (variable.startsWith('NEXT_PUBLIC_')) {
    // Principle 1: nothing sensitive may reach the browser bundle.
    if (/SECRET|TOKEN|PASSWORD|PRIVATE|_KEY/.test(variable)) {
      findings.push(
        finding(
          'error',
          variable,
          'NEXT_PUBLIC_ variables are compiled into the browser bundle: never put a secret in one',
        ),
      );
    }
    return findings;
  }
  if (!known.has(variable)) {
    const hint = closest(variable, [...known]);
    const suggestion = hint ? ` (did you mean ${hint}?)` : '';
    findings.push(
      finding(
        'warning',
        variable,
        `is not a setting AppCore reads${suggestion} — it has no effect`,
      ),
    );
  }
  return findings;
}

function sharedSecretFindings(raw: RawEnv): EnvFinding[] {
  const material = new Map<string, string[]>();
  for (const variable of ['AUTH_SECRET', 'CSRF_SECRET', 'BACKEND_SERVICE_CLIENT_SECRET']) {
    const value = raw[variable];
    if (value && !value.includes('__GENERATE__')) {
      material.set(value, [...(material.get(value) ?? []), variable]);
    }
  }
  return [...material.values()]
    .filter((variables) => variables.length > 1)
    .map((variables) =>
      finding('error', variables[0]!, `uses the same secret as ${variables.slice(1).join(', ')}`),
    );
}

function singleSignOnSetupFindings(raw: RawEnv): EnvFinding[] {
  const oidc = ['AUTH_OIDC_ISSUER', 'AUTH_OIDC_CLIENT_ID', 'AUTH_OIDC_CLIENT_SECRET'];
  const oidcSet = oidc.filter((variable) => raw[variable]);
  if (oidcSet.length > 0 && oidcSet.length < oidc.length) {
    const missing = oidc.filter((variable) => !raw[variable]);
    return [
      finding(
        'warning',
        missing[0]!,
        `single sign-on is half configured (missing ${missing.join(', ')}): the SSO button stays hidden`,
      ),
    ];
  }
  return [];
}

function productionFindings(raw: RawEnv): EnvFinding[] {
  const findings: EnvFinding[] = [];
  const authUrl = parseUrl(raw.AUTH_URL);
  if (!authUrl) {
    findings.push(
      finding('warning', 'AUTH_URL', 'is not set: set the public HTTPS address of the application'),
    );
  } else if (authUrl.protocol === 'http:' && !isLocalHost(authUrl.hostname)) {
    findings.push(
      finding('error', 'AUTH_URL', 'is not HTTPS: the session cookie would travel unencrypted'),
    );
  }
  const backend = parseUrl(raw.BACKEND_URL);
  if (backend?.protocol === 'http:' && !isLocalHost(backend.hostname)) {
    findings.push(finding('warning', 'BACKEND_URL', 'is not HTTPS'));
  }
  if (raw.PAYLOAD_ENCRYPTION_ENABLED === 'false') {
    findings.push(
      finding(
        'warning',
        'PAYLOAD_ENCRYPTION_ENABLED',
        'payload encryption between BFF and backend is off',
      ),
    );
  }
  if (raw.LOG_PRETTY === 'true') {
    findings.push(finding('warning', 'LOG_PRETTY', 'use structured (JSON) logs in production'));
  }
  if (['debug', 'trace'].includes(raw.LOG_LEVEL ?? '')) {
    findings.push(
      finding('warning', 'LOG_LEVEL', `"${raw.LOG_LEVEL}" is verbose for production (use info)`),
    );
  }
  return findings;
}

/**
 * The BFF and the backend share a service identity and a payload key ring. A
 * mismatch only shows at runtime, as failing sign-ins — so compare them here.
 * Secrets are never printed; fingerprints are.
 */
export function compareWithBackend(frontend: RawEnv, backend: RawEnv): EnvFinding[] {
  return [
    ...serviceIdentityFindings(frontend, backend),
    ...payloadEncryptionFindings(frontend, backend),
    ...addressFindings(frontend, backend),
    ...singleSignOnFindings(frontend, backend),
  ];
}

/** Service identity (HMAC request signature). */
function serviceIdentityFindings(frontend: RawEnv, backend: RawEnv): EnvFinding[] {
  const clientId = frontend.BACKEND_SERVICE_CLIENT_ID;
  const secret = frontend.BACKEND_SERVICE_CLIENT_SECRET;
  if (!clientId || !secret) return [];
  const clients = pairs(backend.SERVICE_CLIENTS);
  const expected = clients.get(clientId);
  if (expected === undefined) {
    const registered = [...clients.keys()].join(', ') || 'none';
    return [
      finding(
        'error',
        'BACKEND_SERVICE_CLIENT_ID',
        `"${clientId}" is not registered in the backend's SERVICE_CLIENTS (${registered})`,
      ),
    ];
  }
  if (expected !== secret) {
    return [
      finding(
        'error',
        'BACKEND_SERVICE_CLIENT_SECRET',
        `differs from the backend's secret for "${clientId}" (here ${fingerprint(secret)}, backend ${fingerprint(expected)}): every request would be rejected`,
      ),
    ];
  }
  return [];
}

function payloadEncryptionFindings(frontend: RawEnv, backend: RawEnv): EnvFinding[] {
  const enabled = frontend.PAYLOAD_ENCRYPTION_ENABLED !== 'false';
  const mode = backend.PAYLOAD_ENCRYPTION_MODE ?? 'optional';
  if (mode === 'required' && !enabled) {
    return [
      finding(
        'error',
        'PAYLOAD_ENCRYPTION_ENABLED',
        'is false but the backend requires encrypted payloads (PAYLOAD_ENCRYPTION_MODE=required)',
      ),
    ];
  }
  if (mode === 'disabled' && enabled) {
    return [
      finding(
        'error',
        'PAYLOAD_ENCRYPTION_ENABLED',
        'is true but the backend has payload encryption disabled',
      ),
    ];
  }
  if (!enabled) return [];
  const rings = {
    ours: pairs(frontend.PAYLOAD_ENCRYPTION_KEYS),
    theirs: pairs(backend.PAYLOAD_ENCRYPTION_KEYS),
  };
  const ourActive = frontend.PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID;
  const theirActive = backend.PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID;
  return [
    ...activeKeyFindings(ourActive, 'BFF', rings),
    ...(theirActive === ourActive ? [] : activeKeyFindings(theirActive, 'backend', rings)),
  ];
}

/** The key one side encrypts with must exist, with the same value, on both sides. */
function activeKeyFindings(
  keyId: string | undefined,
  side: 'BFF' | 'backend',
  rings: { ours: ReadonlyMap<string, string>; theirs: ReadonlyMap<string, string> },
): EnvFinding[] {
  if (!keyId) return [];
  const a = rings.ours.get(keyId);
  const b = rings.theirs.get(keyId);
  if (!a || !b) {
    const where = side === 'BFF' ? 'backend' : 'BFF';
    return [
      finding(
        'error',
        'PAYLOAD_ENCRYPTION_KEYS',
        `the ${side} encrypts with key "${keyId}", which the ${where} does not have`,
      ),
    ];
  }
  if (a !== b) {
    return [
      finding(
        'error',
        'PAYLOAD_ENCRYPTION_KEYS',
        `key "${keyId}" differs between BFF (${fingerprint(a)}) and backend (${fingerprint(b)})`,
      ),
    ];
  }
  return [];
}

function addressFindings(frontend: RawEnv, backend: RawEnv): EnvFinding[] {
  const findings: EnvFinding[] = [];
  const backendUrl = parseUrl(frontend.BACKEND_URL);
  const port = backend.PORT ?? '4000';
  if (backendUrl && isLocalHost(backendUrl.hostname) && (backendUrl.port || '80') !== port) {
    findings.push(
      finding(
        'warning',
        'BACKEND_URL',
        `points to port ${backendUrl.port || '80'} but the backend listens on ${port}`,
      ),
    );
  }
  const prefix = `/${backend.API_PREFIX ?? 'api'}/v${backend.API_DEFAULT_VERSION ?? '1'}`;
  if ((frontend.BACKEND_API_PREFIX ?? '/api/v1') !== prefix) {
    findings.push(
      finding(
        'error',
        'BACKEND_API_PREFIX',
        `is "${frontend.BACKEND_API_PREFIX ?? '/api/v1'}" but the backend serves "${prefix}"`,
      ),
    );
  }
  return findings;
}

function singleSignOnFindings(frontend: RawEnv, backend: RawEnv): EnvFinding[] {
  if (!frontend.AUTH_OIDC_ISSUER) return [];
  if (backend.OIDC_ENABLED !== 'true') {
    return [
      finding(
        'warning',
        'AUTH_OIDC_ISSUER',
        'single sign-on is configured here but OIDC_ENABLED is not true in the backend',
      ),
    ];
  }
  if ((frontend.AUTH_OIDC_BACKEND_PROVIDER ?? 'oidc') !== (backend.OIDC_PROVIDER_NAME ?? 'oidc')) {
    return [
      finding(
        'error',
        'AUTH_OIDC_BACKEND_PROVIDER',
        `does not match the backend's OIDC_PROVIDER_NAME ("${backend.OIDC_PROVIDER_NAME ?? 'oidc'}")`,
      ),
    ];
  }
  return [];
}
