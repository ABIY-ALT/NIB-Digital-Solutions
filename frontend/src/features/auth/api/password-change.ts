import { cookies } from 'next/headers';
import { env } from '@/infrastructure/config/env';
import { deriveKey, seal, unseal } from '@/infrastructure/security/sealed';

/**
 * A sign-in that must set a new password first (expired, or temporary after
 * an administrator reset). The backend's one-time change token is kept in a
 * sealed, httpOnly cookie — the browser only learns the reason.
 */
const COOKIE = 'appcore.pwd';

export interface PendingPasswordChange {
  changeToken: string;
  reason: 'EXPIRED' | 'RESET';
  expiresAt: string;
}

const key = () => deriveKey(env().AUTH_SECRET, 'appcore-password-change');

export async function setPendingPasswordChange(pending: PendingPasswordChange): Promise<void> {
  const maxAge = Math.max(1, Math.floor((Date.parse(pending.expiresAt) - Date.now()) / 1000));
  (await cookies()).set(COOKIE, seal(pending, key()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  });
}

export async function getPendingPasswordChange(): Promise<PendingPasswordChange | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const pending = unseal<PendingPasswordChange>(raw, key());
  return pending && Date.parse(pending.expiresAt) > Date.now() ? pending : null;
}

export async function clearPendingPasswordChange(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
