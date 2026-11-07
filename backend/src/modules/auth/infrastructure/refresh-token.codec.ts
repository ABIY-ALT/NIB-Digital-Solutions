import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RefreshTokenCodec } from '../application/ports/auth.ports.js';

const PREFIX = 'rt1';
const UUID = /^[0-9a-f-]{36}$/;

/**
 * Opaque refresh tokens: "rt1.<sessionId>.<256-bit random>". Only the SHA-256 of
 * the random part is stored, so a store leak does not expose usable tokens.
 */
@Injectable()
export class OpaqueRefreshTokenCodec implements RefreshTokenCodec {
  generate(sessionId: string): { token: string; hash: string } {
    const secret = randomBytes(32).toString('base64url');
    return { token: `${PREFIX}.${sessionId}.${secret}`, hash: this.hash(secret) };
  }

  parse(token: string): { sessionId: string; hash: string } | null {
    const [prefix, sessionId, secret] = token.split('.');
    if (prefix !== PREFIX || !sessionId || !UUID.test(sessionId) || !secret || secret.length < 40)
      return null;
    return { sessionId, hash: this.hash(secret) };
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }
}
