import { decode, encode } from 'next-auth/jwt';
import type { AppCoreSessionData } from '@/features/auth/api/session-data';

/**
 * The session cookie is Auth.js's encrypted JWT (JWE). These helpers read and
 * write it outside Auth.js (in proxy.ts and server components), using the same
 * name, salt and chunking rules so Auth.js keeps working with it.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-appcore.session' : 'appcore.session';
const CHUNK_SIZE = 3933; // Auth.js: 4096 minus estimated cookie overhead

export interface CookieLike {
  name: string;
  value: string;
}

/** Joins a possibly chunked session cookie (name, name.0, name.1, ...). */
export function readSessionCookie(cookies: CookieLike[]): string | undefined {
  const single = cookies.find((c) => c.name === SESSION_COOKIE);
  if (single) return single.value;
  const chunks = cookies
    .filter((c) => c.name.startsWith(`${SESSION_COOKIE}.`))
    .sort((a, b) => Number(a.name.split('.').pop()) - Number(b.name.split('.').pop()));
  return chunks.length ? chunks.map((c) => c.value).join('') : undefined;
}

/** Cookie names currently used by the session (to delete stale chunks). */
export function sessionCookieNames(cookies: CookieLike[]): string[] {
  return cookies
    .map((c) => c.name)
    .filter((n) => n === SESSION_COOKIE || n.startsWith(`${SESSION_COOKIE}.`));
}

/** Splits an encoded token into cookies following Auth.js' chunking convention. */
export function chunkSessionCookie(value: string): CookieLike[] {
  if (value.length <= CHUNK_SIZE) return [{ name: SESSION_COOKIE, value }];
  const chunks: CookieLike[] = [];
  for (let i = 0; i * CHUNK_SIZE < value.length; i++) {
    chunks.push({
      name: `${SESSION_COOKIE}.${i}`,
      value: value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    });
  }
  return chunks;
}

export const sessionCookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSeconds,
});

interface TokenShape {
  appcore?: AppCoreSessionData;
  [key: string]: unknown;
}

export async function decodeSession(
  raw: string | undefined,
  secret: string,
): Promise<TokenShape | null> {
  if (!raw) return null;
  try {
    return (await decode({ token: raw, secret, salt: SESSION_COOKIE })) as TokenShape | null;
  } catch {
    return null;
  }
}

export function encodeSession(
  token: TokenShape,
  secret: string,
  maxAgeSeconds: number,
): Promise<string> {
  return encode({ token, secret, salt: SESSION_COOKIE, maxAge: maxAgeSeconds });
}
