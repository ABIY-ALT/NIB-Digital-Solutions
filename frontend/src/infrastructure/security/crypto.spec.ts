import { describe, expect, it } from 'vitest';
import {
  decryptPayload,
  encryptPayload,
  requestPurpose,
  responsePurpose,
} from '@/infrastructure/security/payload-crypto';
import { seal, unseal, deriveKey } from '@/infrastructure/security/sealed';
import {
  canonicalString,
  signRequest,
  verifySignature,
} from '@/infrastructure/security/request-signature';

/**
 * SHARED COMPATIBILITY VECTORS — identical to
 * backend/src/core/infrastructure/crypto/crypto.spec.ts. If this suite fails,
 * the BFF and the backend no longer speak the same protocol.
 */
const KEY = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
const IV = Buffer.from('a0a1a2a3a4a5a6a7a8a9aaab', 'hex');
const PLAINTEXT = '{"username":"admin","password":"Secret#1"}';

describe('payload encryption protocol v1 (backend compatible)', () => {
  it('matches the backend test vector', () => {
    const purpose = requestPurpose('post', '/api/v1/auth/login?x=1');
    expect(purpose).toBe('req:POST:/api/v1/auth/login');
    expect(encryptPayload(PLAINTEXT, KEY, 'k1', purpose, IV)).toEqual({
      v: 1,
      alg: 'A256GCM',
      kid: 'k1',
      iv: 'oKGio6Slpqeoqaqr',
      tag: 'eN4ESOOiLKHc6Q0uosnQ3Q',
      ct: 'nToJXiC5bN4PAKXpJRuksxnCezywxyMf73lJ9BuJTyOBEySNylZwDH3h',
    });
  });

  it('binds ciphertexts to their purpose', () => {
    const env = encryptPayload(PLAINTEXT, KEY, 'k1', responsePurpose('c1'));
    expect(decryptPayload(env, KEY, responsePurpose('c1'))).toBe(PLAINTEXT);
    expect(() => decryptPayload(env, KEY, responsePurpose('c2'))).toThrow();
  });
});

describe('request signature protocol v1 (backend compatible)', () => {
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

  it('matches the backend canonical string and signature', () => {
    expect(canonicalString(input)).toBe(
      [
        'APPCORE-HMAC-SHA256',
        'POST',
        '/api/v1/auth/login',
        '1760000000000',
        'nonce-123',
        'corr-abc',
        '10.0.0.5',
        '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
      ].join('\n'),
    );
    const sig = signRequest(input, secret);
    expect(sig).toBe('v1=Nr2O72cEYyGfRsKQXs7If9OpQRLqagkPxoW28ZTKt2s');
    expect(verifySignature(input, secret, sig)).toBe(true);
    expect(verifySignature({ ...input, nonce: 'other' }, secret, sig)).toBe(false);
  });
});

describe('sealed values', () => {
  it('round-trips and rejects tampering / wrong keys', () => {
    const key = deriveKey('master-secret', 'mfa');
    const sealed = seal({ challengeId: 'x' }, key);
    expect(unseal(sealed, key)).toEqual({ challengeId: 'x' });
    expect(unseal(sealed, deriveKey('master-secret', 'other'))).toBeNull();
    expect(unseal(sealed.slice(0, -2) + 'AA', key)).toBeNull();
  });
});
