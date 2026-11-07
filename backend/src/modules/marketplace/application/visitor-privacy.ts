import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { BadRequestError } from '#core/domain/errors/app-error.js';

/**
 * Privacy helpers for the public website forms (ideas board, product
 * questions). Visitor IPs and anonymous voter tokens are only ever stored as
 * keyed hashes: comparable (rate limits, one vote per visitor) but not
 * reversible, and useless without the server's salt.
 */
export function visitorHash(salt: string, value: string): string {
  return createHmac('sha256', salt).update(value.trim().toLowerCase()).digest('hex');
}

/** A fresh secret for a private link (e.g. a customer's conversation page). */
export function newAccessToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: tokenHash(token) };
}

/** SHA-256 of an access token (what is stored). */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of a presented token with a stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(tokenHash(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fastest a person fills a form; quicker submissions are treated as automated. */
export const MIN_FILL_MS = 2500;

/**
 * The website's spam check (same rules as the demo and inquiry forms): an
 * invisible honeypot field must stay empty and the form must not be filled
 * faster than a person can. Combined with per-IP rate limits on every public
 * endpoint and server-side validation.
 */
export function assertHuman(meta: { honeypot: string; elapsedMs: number }): void {
  if (meta.honeypot.trim() !== '' || meta.elapsedMs < MIN_FILL_MS) {
    throw new BadRequestError('We could not verify this submission. Please try again.', {
      reason: 'spam',
    });
  }
}
