// node --test tools/cli  (run by `npm test` in the appcore root)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractJson, getEnvValue, prepareEnvironments, setEnvValue } from './env.mjs';

const secrets = {
  jwt: 'JWT',
  mfa: 'MFA',
  audit: 'AUDIT',
  payloadKey: 'PAYLOAD',
  service: 'SERVICE',
  auth: 'AUTH',
  csrf: 'CSRF',
};
const backendTemplate = [
  '# Backend',
  'PORT=4000',
  'JWT_ACCESS_SECRET=__GENERATE__base64_48_bytes',
  'MFA_SECRET_ENCRYPTION_KEY=__GENERATE__base64_32_bytes',
  'SERVICE_CLIENTS=appcore-web:__GENERATE__shared_secret',
  'PAYLOAD_ENCRYPTION_KEYS=k1:__GENERATE__base64_32_bytes',
  'AUDIT_CHAIN_KEY=',
  '',
].join('\n');
const frontendTemplate = [
  'BACKEND_SERVICE_CLIENT_ID=appcore-web',
  'BACKEND_SERVICE_CLIENT_SECRET=__GENERATE__',
  'PAYLOAD_ENCRYPTION_KEYS=k1:__GENERATE__',
  'AUTH_SECRET=__GENERATE__',
  'CSRF_SECRET=__GENERATE__',
  '',
].join('\n');

test('reads and replaces dotenv values in place', () => {
  const text = '# comment\nA=1\nB="two"\n';
  assert.equal(getEnvValue(text, 'B'), 'two');
  assert.equal(getEnvValue(text, 'C'), undefined);
  assert.equal(setEnvValue(text, 'A', '9'), '# comment\nA=9\nB="two"\n');
  assert.equal(setEnvValue(text, 'C', '3'), '# comment\nA=1\nB="two"\nC=3\n');
  // "$" in a secret must not be treated as a replacement pattern.
  assert.equal(getEnvValue(setEnvValue(text, 'A', 'x$&y$1'), 'A'), 'x$&y$1');
});

test('fills fresh templates with matching shared secrets', () => {
  const result = prepareEnvironments({ backend: backendTemplate, frontend: frontendTemplate, secrets });
  assert.equal(getEnvValue(result.backend, 'SERVICE_CLIENTS'), 'appcore-web:SERVICE');
  assert.equal(getEnvValue(result.frontend, 'BACKEND_SERVICE_CLIENT_SECRET'), 'SERVICE');
  assert.equal(getEnvValue(result.backend, 'PAYLOAD_ENCRYPTION_KEYS'), 'k1:PAYLOAD');
  assert.equal(getEnvValue(result.frontend, 'PAYLOAD_ENCRYPTION_KEYS'), 'k1:PAYLOAD');
  assert.equal(getEnvValue(result.backend, 'AUDIT_CHAIN_KEY'), 'AUDIT');
  assert.equal(getEnvValue(result.backend, 'PORT'), '4000');
  assert.ok(result.backend.startsWith('# Backend\n'));
  assert.ok(!result.backend.includes('__GENERATE__') && !result.frontend.includes('__GENERATE__'));
  assert.deepEqual(result.filled.frontend, [
    'BACKEND_SERVICE_CLIENT_SECRET',
    'PAYLOAD_ENCRYPTION_KEYS',
    'AUTH_SECRET',
    'CSRF_SECRET',
  ]);
});

test('never changes a value that is already set', () => {
  const first = prepareEnvironments({ backend: backendTemplate, frontend: frontendTemplate, secrets });
  const again = prepareEnvironments({ backend: first.backend, frontend: first.frontend });
  assert.equal(again.backend, first.backend);
  assert.equal(again.frontend, first.frontend);
  assert.deepEqual(again.filled, { backend: [], frontend: [] });
});

test('completes a new side from the secrets the other side already has', () => {
  const backend = setEnvValue(
    setEnvValue(backendTemplate, 'SERVICE_CLIENTS', 'appcore-web:EXISTING,mobile:OTHER'),
    'PAYLOAD_ENCRYPTION_KEYS',
    'k1:OLD,k2:NEW',
  );
  const result = prepareEnvironments({ backend, frontend: frontendTemplate, secrets });
  assert.equal(getEnvValue(result.frontend, 'BACKEND_SERVICE_CLIENT_SECRET'), 'EXISTING');
  assert.equal(getEnvValue(result.frontend, 'PAYLOAD_ENCRYPTION_KEYS'), 'k1:OLD,k2:NEW');
  assert.equal(getEnvValue(result.backend, 'SERVICE_CLIENTS'), 'appcore-web:EXISTING,mobile:OTHER');
});

test('extracts the JSON document from noisy child output', () => {
  assert.deepEqual(extractJson('banner\n{"a":{"b":"}"},"c":[1]}\ntrailer {x}'), { a: { b: '}' }, c: [1] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{"broken": '), null);
});
