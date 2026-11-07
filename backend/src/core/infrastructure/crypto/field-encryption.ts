import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Column-level encryption for secrets at rest (e.g. TOTP shared secrets).
 * Format: "fe1.<iv>.<tag>.<ciphertext>" (base64url segments), AES-256-GCM.
 */
export class FieldEncryption {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('Field encryption key must be 32 bytes');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: 16 });
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['fe1', iv, cipher.getAuthTag(), ct]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  decrypt(value: string): string {
    const [version, iv, tag, ct] = value.split('.');
    if (version !== 'fe1' || !iv || !tag || !ct)
      throw new Error('Unsupported encrypted field format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'), {
      authTagLength: 16,
    });
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
