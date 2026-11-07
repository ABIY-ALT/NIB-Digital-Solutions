import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AppCore application-level payload encryption (BFF ⇄ backend), protocol v1.
 *
 * MUST stay byte-for-byte compatible with frontend/packages/crypto/src/payload.ts.
 * Shared test vectors live in both projects (payload-crypto.spec.ts).
 *
 *   Algorithm : AES-256-GCM, 96-bit random IV, 128-bit tag
 *   Key       : 32 bytes, selected by `kid` from a key ring (supports rotation)
 *   AAD       : "appcore-payload/v1|<kid>|<purpose>"
 *                 request  purpose = "req:<METHOD>:<path without query>"
 *                 response purpose = "res:<correlation id>"
 *               Binding the purpose prevents replaying a ciphertext against
 *               another endpoint or pairing a response with another request.
 *   Wire body : { "enc": { "v": 1, "alg": "A256GCM", "kid", "iv", "tag", "ct" } }
 *               (iv / tag / ct are base64url)
 *   Header    : X-AppCore-Encrypted: 1
 */

export const ENCRYPTION_HEADER = 'x-appcore-encrypted';
export const PAYLOAD_PROTOCOL = 'appcore-payload/v1';

export interface EncryptedEnvelope {
  v: 1;
  alg: 'A256GCM';
  kid: string;
  iv: string;
  tag: string;
  ct: string;
}

export interface EncryptedBody {
  enc: EncryptedEnvelope;
}

export function requestPurpose(method: string, path: string): string {
  return `req:${method.toUpperCase()}:${path.split('?')[0]}`;
}

export function responsePurpose(correlationId: string): string {
  return `res:${correlationId}`;
}

function aad(kid: string, purpose: string): Buffer {
  return Buffer.from(`${PAYLOAD_PROTOCOL}|${kid}|${purpose}`, 'utf8');
}

export function encryptPayload(
  plaintext: string,
  key: Buffer,
  kid: string,
  purpose: string,
  iv: Buffer = randomBytes(12),
): EncryptedEnvelope {
  if (key.length !== 32) throw new Error('Payload key must be 32 bytes');
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(aad(kid, purpose));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: 'A256GCM',
    kid,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ct: ct.toString('base64url'),
  };
}

export function decryptPayload(envelope: EncryptedEnvelope, key: Buffer, purpose: string): string {
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM')
    throw new Error('Unsupported envelope version');
  const iv = Buffer.from(envelope.iv, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Malformed envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAAD(aad(envelope.kid, purpose));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ct, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function isEncryptedBody(body: unknown): body is EncryptedBody {
  if (typeof body !== 'object' || body === null || !('enc' in body)) return false;
  const enc = body.enc;
  return (
    typeof enc === 'object' &&
    enc !== null &&
    ['kid', 'iv', 'tag', 'ct'].every((k) => typeof (enc as Record<string, unknown>)[k] === 'string')
  );
}
