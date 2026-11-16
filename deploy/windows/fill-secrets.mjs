#!/usr/bin/env node
// Writes fresh random secrets over every __GENERATE__ placeholder in
// backend/.env and frontend/.env.production, so the values the two files share
// (service client secret, payload encryption key) match.
//
//   node deploy/windows/fill-secrets.mjs
//
// Only placeholders are replaced: a secret that is already set is never
// changed, so running it again is safe. That matters: changing
// AUDIT_CHAIN_KEY or MFA_SECRET_ENCRYPTION_KEY later breaks the audit trail
// and every user's two-step verification. Secret values are never printed.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '__GENERATE__';
const root = fileURLToPath(new URL('../..', import.meta.url));

const files = {
  backend: { path: join(root, 'backend', '.env'), template: 'backend\\.env.windows.example' },
  frontend: {
    path: join(root, 'frontend', '.env.production'),
    template: 'frontend\\.env.windows.example',
  },
};

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const show = (path) => relative(root, path);

for (const file of Object.values(files)) {
  if (!existsSync(file.path)) {
    fail(`${show(file.path)} not found. Copy ${file.template} to ${show(file.path)} first.`);
  }
  const text = readFileSync(file.path, 'utf8');
  file.eol = text.includes('\r\n') ? '\r\n' : '\n';
  file.lines = text.split(/\r?\n/);
}

/** The raw value of KEY=value in a file, or undefined. */
function valueOf(file, key) {
  return file.lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1);
}

// A shared value must be generated for both files at once. If one file already
// has it and the other still has a placeholder, generating would break the
// match, so stop and let the operator copy it over.
const shared = [
  ['The service client secret', 'SERVICE_CLIENTS', 'BACKEND_SERVICE_CLIENT_SECRET'],
  ['The payload encryption key', 'PAYLOAD_ENCRYPTION_KEYS', 'PAYLOAD_ENCRYPTION_KEYS'],
];
for (const [label, backendKey, frontendKey] of shared) {
  const inBackend = valueOf(files.backend, backendKey)?.includes(PLACEHOLDER) ?? false;
  const inFrontend = valueOf(files.frontend, frontendKey)?.includes(PLACEHOLDER) ?? false;
  if (inBackend !== inFrontend) {
    fail(
      `${label} is already set in one file but not in the other ` +
        `(backend ${backendKey}, frontend ${frontendKey}). Copy the existing value over by hand.`,
    );
  }
}

const base64 = (bytes) => randomBytes(bytes).toString('base64');
const serviceSecret = randomBytes(32).toString('base64url');
const payloadKey = base64(32);

const generators = {
  JWT_ACCESS_SECRET: () => base64(48),
  MFA_SECRET_ENCRYPTION_KEY: () => base64(32),
  AUDIT_CHAIN_KEY: () => base64(32),
  MARKETPLACE_PRIVACY_SALT: () => base64(32),
  AUTH_SECRET: () => base64(32),
  CSRF_SECRET: () => base64(32),
  SERVICE_CLIENTS: () => serviceSecret,
  BACKEND_SERVICE_CLIENT_SECRET: () => serviceSecret,
  PAYLOAD_ENCRYPTION_KEYS: () => payloadKey,
};

// Work out every replacement before writing anything.
for (const file of Object.values(files)) {
  file.filled = [];
  file.lines = file.lines.map((line) => {
    const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    if (!key || !line.includes(PLACEHOLDER)) return line;
    const generate = generators[key];
    if (!generate) fail(`${show(file.path)}: ${key} has ${PLACEHOLDER}, but no secret is generated for it.`);
    file.filled.push(key);
    return line.replace(PLACEHOLDER, generate());
  });
}

for (const file of Object.values(files)) {
  if (file.filled.length > 0) writeFileSync(file.path, file.lines.join(file.eol));
  console.log(
    file.filled.length > 0
      ? `✔ ${show(file.path)}: filled ${file.filled.join(', ')}`
      : `• ${show(file.path)}: no placeholders left, nothing changed`,
  );
  const todo = file.lines
    .filter((line) => !line.startsWith('#') && line.includes('CHANGE_ME'))
    .map((line) => line.split('=')[0]);
  if (todo.length > 0) console.log(`  Still to fill in by hand: ${todo.join(', ')}`);
}

console.log('\nKeep a copy of both files somewhere safe: the secrets cannot be recovered.');
