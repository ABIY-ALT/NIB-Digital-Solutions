import {
  decryptPayload,
  encryptPayload,
  requestPurpose,
  responsePurpose,
} from './payload-crypto.js';
import { canonicalString, signRequest, verifySignature } from './request-signature.js';
import { FieldEncryption } from './field-encryption.js';

/**
 * Cross-project compatibility vectors. The SAME constants and expected values
 * appear in frontend/packages/crypto/src/crypto.spec.ts — if either side changes
 * the protocol, both suites fail.
 */
const KEY = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
const IV = Buffer.from('a0a1a2a3a4a5a6a7a8a9aaab', 'hex');
const PLAINTEXT = '{"username":"admin","password":"Secret#1"}';

const PAYLOAD_VECTOR = {
  kid: 'k1',
  purpose: requestPurpose('post', '/api/v1/auth/login?x=1'),
};

describe('payload encryption protocol v1', () => {
  it('produces the shared test vector', () => {
    const env = encryptPayload(PLAINTEXT, KEY, PAYLOAD_VECTOR.kid, PAYLOAD_VECTOR.purpose, IV);
    expect(PAYLOAD_VECTOR.purpose).toBe('req:POST:/api/v1/auth/login');
    expect(env).toMatchInlineSnapshot(`
      {
        "alg": "A256GCM",
        "ct": "nToJXiC5bN4PAKXpJRuksxnCezywxyMf73lJ9BuJTyOBEySNylZwDH3h",
        "iv": "oKGio6Slpqeoqaqr",
        "kid": "k1",
        "tag": "eN4ESOOiLKHc6Q0uosnQ3Q",
        "v": 1,
      }
    `);
  });

  it('round-trips and rejects a different purpose (AAD binding)', () => {
    const env = encryptPayload(PLAINTEXT, KEY, 'k1', responsePurpose('corr-1'));
    expect(decryptPayload(env, KEY, responsePurpose('corr-1'))).toBe(PLAINTEXT);
    expect(() => decryptPayload(env, KEY, responsePurpose('corr-2'))).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const env = encryptPayload(PLAINTEXT, KEY, 'k1', 'p');
    const tampered = { ...env, ct: Buffer.from('x' + env.ct).toString('base64url') };
    expect(() => decryptPayload(tampered, KEY, 'p')).toThrow();
  });
});

describe('request signature protocol v1', () => {
  const input = {
    method: 'post',
    pathWithQuery: '/api/v1/auth/login',
    timestamp: '1760000000000',
    nonce: 'nonce-123',
    correlationId: 'corr-abc',
    clientIp: '10.0.0.5',
    body: '{"a":1}',
  };
  const secret = 'test-secret-test-secret-test-secret-00';

  it('builds the canonical string', () => {
    expect(canonicalString(input)).toMatchInlineSnapshot(`
      "APPCORE-HMAC-SHA256
      POST
      /api/v1/auth/login
      1760000000000
      nonce-123
      corr-abc
      10.0.0.5
      015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862"
    `);
  });

  it('produces the shared signature vector and verifies', () => {
    const sig = signRequest(input, secret);
    expect(sig).toMatchInlineSnapshot(`"v1=Nr2O72cEYyGfRsKQXs7If9OpQRLqagkPxoW28ZTKt2s"`);
    expect(verifySignature(input, secret, sig)).toBe(true);
    expect(verifySignature({ ...input, body: '{"a":2}' }, secret, sig)).toBe(false);
  });
});

describe('field encryption', () => {
  it('round-trips', () => {
    const fe = new FieldEncryption(KEY);
    const enc = fe.encrypt('JBSWY3DPEHPK3PXP');
    expect(enc.startsWith('fe1.')).toBe(true);
    expect(fe.decrypt(enc)).toBe('JBSWY3DPEHPK3PXP');
  });
});
