import { randomBytes } from 'node:crypto';
import { deriveKey, hmac, safeEqual } from '@/infrastructure/security/sealed';

/**
 * CSRF protection for BFF route handlers (double-submit, signed token).
 * proxy.ts issues the cookie; the browser echoes it in X-CSRF-Token on every
 * state-changing request; route handlers verify both match and the signature
 * is ours (prevents cookie tossing). Server actions additionally rely on
 * Next.js' built-in Origin check.
 */
export const CSRF_COOKIE = 'appcore.csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function issueCsrfToken(secret: string): string {
  const nonce = randomBytes(18).toString('base64url');
  return `${nonce}.${hmac(nonce, deriveKey(secret, 'csrf'))}`;
}

export function isValidCsrfToken(token: string | undefined | null, secret: string): boolean {
  if (!token) return false;
  const [nonce, sig] = token.split('.');
  return !!nonce && !!sig && safeEqual(sig, hmac(nonce, deriveKey(secret, 'csrf')));
}

export function verifyCsrf(
  cookieToken: string | undefined,
  headerToken: string | null,
  secret: string,
): boolean {
  return (
    !!cookieToken &&
    !!headerToken &&
    safeEqual(cookieToken, headerToken) &&
    isValidCsrfToken(cookieToken, secret)
  );
}
