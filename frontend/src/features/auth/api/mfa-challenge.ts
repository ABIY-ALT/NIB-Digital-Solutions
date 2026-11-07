import { cookies } from 'next/headers';
import { deriveKey, seal, unseal } from '@/infrastructure/security/sealed';
import { env } from '@/infrastructure/config/env';

/**
 * The pending MFA challenge is kept server-side in a sealed, httpOnly cookie.
 * The browser never sees the challenge id — only the method and a safe hint.
 */
const COOKIE = 'appcore.mfa';

export interface PendingMfa {
  challengeId: string;
  method: 'TOTP' | 'SMS';
  expiresAt: string;
  deliveryHint?: string;
}

const key = () => deriveKey(env().AUTH_SECRET, 'appcore-mfa-challenge');

export async function setPendingMfa(pending: PendingMfa): Promise<void> {
  const maxAge = Math.max(1, Math.floor((Date.parse(pending.expiresAt) - Date.now()) / 1000));
  (await cookies()).set(COOKIE, seal(pending, key()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  });
}

export async function getPendingMfa(): Promise<PendingMfa | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const pending = unseal<PendingMfa>(raw, key());
  return pending && Date.parse(pending.expiresAt) > Date.now() ? pending : null;
}

export async function clearPendingMfa(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
