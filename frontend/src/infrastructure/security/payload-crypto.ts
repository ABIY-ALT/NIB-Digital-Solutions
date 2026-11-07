import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AppCore payload encryption protocol v1 (BFF ⇄ backend). SERVER-SIDE ONLY.
 *
 * Byte-for-byte compatible with backend/src/core/infrastructure/crypto/payload-crypto.ts
 * (verified by shared test vectors in both projects).
 *
 *   AES-256-GCM · 96-bit IV · 128-bit tag
 *   AAD  = "appcore-payload/v1|<kid>|<purpose>"
 *          request  purpose: "req:<METHOD>:<path without query>"
 *          response purpose: "res:<correlation id>"
 *   Body = { "enc": { v: 1, alg: "A256GCM", kid, iv, tag, ct } }   (base64url)
 *   Header X-AppCore-Encrypted: 1
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

export interface KeyRing {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

export const requestPurpose = (method: string, path: string): string =>
  `req:${method.toUpperCase()}:${path.split('?')[0]}`;

export const responsePurpose = (correlationId: string): string => `res:${correlationId}`;

const aad = (kid: string, purpose: string): Buffer =>
  Buffer.from(`${PAYLOAD_PROTOCOL}|${kid}|${purpose}`, 'utf8');

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
  const enc = (body as { enc: unknown }).enc;
  return (
    typeof enc === 'object' &&
    enc !== null &&
    ['kid', 'iv', 'tag', 'ct'].every((k) => typeof (enc as Record<string, unknown>)[k] === 'string')
  );
}

/** Parses "kid:base64,kid2:base64" into a key ring (each key exactly 32 bytes). */
export function parseKeyRing(spec: string, activeKeyId: string): KeyRing {
  const keys = new Map<string, Buffer>();
  for (const pair of spec
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const idx = pair.indexOf(':');
    const key = Buffer.from(pair.slice(idx + 1), 'base64');
    if (idx <= 0 || key.length !== 32) throw new Error('Invalid payload encryption key ring entry');
    keys.set(pair.slice(0, idx), key);
  }
  if (!keys.has(activeKeyId))
    throw new Error(`Active payload key "${activeKeyId}" not found in key ring`);
  return { activeKeyId, keys };
}
