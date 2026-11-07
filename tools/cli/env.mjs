/**
 * Environment files for `appcore setup`: create them from the templates and
 * fill in secrets — the SHARED ones (service identity, payload key ring) with
 * the same value on both sides, which is the step people get wrong by hand.
 *
 * Rule: a value that is already set is never changed. Only missing values and
 * template placeholders (`__GENERATE__…`) are filled.
 */
import { randomBytes } from 'node:crypto';

export const SERVICE_CLIENT_ID = 'appcore-web';

const base64 = (bytes) => randomBytes(bytes).toString('base64');

export function generateSecrets() {
  return {
    jwt: base64(48),
    mfa: base64(32),
    audit: base64(32),
    payloadKey: base64(32),
    service: randomBytes(32).toString('base64url'),
    auth: base64(32),
    csrf: base64(32),
  };
}

/** Value of KEY in dotenv text (last assignment wins), or undefined. */
export function getEnvValue(text, key) {
  let value;
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && match[1] === key) value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return value;
}

/** Replaces the KEY line in place (keeping comments and order), or appends it. */
export function setEnvValue(text, key, value) {
  const pattern = new RegExp(`^(\\s*)${key}\\s*=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, (_line, indent) => `${indent}${key}=${value}`);
  return `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

export const isUnset = (value) => !value || value.includes('__GENERATE__');

/** Secret registered for `clientId` in `id:secret,id2:secret2`. */
function serviceSecretOf(serviceClients, clientId) {
  for (const pair of (serviceClients ?? '').split(',')) {
    const index = pair.indexOf(':');
    if (index > 0 && pair.slice(0, index).trim() === clientId) return pair.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * Fills both environment files. `backend` / `frontend` are the current file
 * contents (or the template when the file does not exist yet).
 * Returns the new texts and, per file, which keys were filled.
 */
export function prepareEnvironments({ backend, frontend, secrets = generateSecrets() }) {
  const filled = { backend: [], frontend: [] };
  const fill = (side, text, key, value) => {
    if (!isUnset(getEnvValue(text, key))) return text;
    filled[side].push(key);
    return setEnvValue(text, key, value);
  };

  // Shared values: whichever side already has a real one wins, so an existing
  // installation is completed rather than broken.
  const clientId = getEnvValue(frontend, 'BACKEND_SERVICE_CLIENT_ID') || SERVICE_CLIENT_ID;
  const existingService = [
    serviceSecretOf(getEnvValue(backend, 'SERVICE_CLIENTS'), clientId),
    getEnvValue(frontend, 'BACKEND_SERVICE_CLIENT_SECRET'),
  ].find((value) => !isUnset(value));
  const service = existingService ?? secrets.service;
  const existingKeys = [
    getEnvValue(backend, 'PAYLOAD_ENCRYPTION_KEYS'),
    getEnvValue(frontend, 'PAYLOAD_ENCRYPTION_KEYS'),
  ].find((value) => !isUnset(value));
  const keyRing = existingKeys ?? `k1:${secrets.payloadKey}`;

  let b = backend;
  b = fill('backend', b, 'JWT_ACCESS_SECRET', secrets.jwt);
  b = fill('backend', b, 'MFA_SECRET_ENCRYPTION_KEY', secrets.mfa);
  b = fill('backend', b, 'AUDIT_CHAIN_KEY', secrets.audit);
  b = fill('backend', b, 'SERVICE_CLIENTS', `${clientId}:${service}`);
  b = fill('backend', b, 'PAYLOAD_ENCRYPTION_KEYS', keyRing);

  let f = frontend;
  f = fill('frontend', f, 'BACKEND_SERVICE_CLIENT_SECRET', service);
  f = fill('frontend', f, 'PAYLOAD_ENCRYPTION_KEYS', keyRing);
  f = fill('frontend', f, 'AUTH_SECRET', secrets.auth);
  f = fill('frontend', f, 'CSRF_SECRET', secrets.csrf);

  return { backend: b, frontend: f, filled };
}

/**
 * The first JSON document in a child process's stdout. Tolerates tools that
 * print banners around it (IDE extensions that hook into Node do).
 */
export function extractJson(stdout) {
  const start = stdout.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < stdout.length; i++) {
    const char = stdout[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        return JSON.parse(stdout.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
