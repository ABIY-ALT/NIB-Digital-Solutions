import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Small helpers for BFF-internal secrets (short-lived MFA challenge cookie,
 * CSRF token signing). Keys are derived from a master secret per purpose.
 */
export function deriveKey(masterSecret: string, purpose: string): Buffer {
  return createHash('sha256').update(`${purpose}|${masterSecret}`).digest();
}

/** Authenticated encryption of a small JSON value into a URL-safe string. */
export function seal(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

export function unseal<T>(sealed: string, key: Buffer): T | null {
  try {
    const [iv, tag, ct] = sealed.split('.');
    if (!iv || !tag || !ct) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), {
      authTagLength: 16,
    });
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const json = Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function hmac(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
