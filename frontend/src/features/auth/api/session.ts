import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { appConfig } from '@/infrastructure/config/app.config';
import { env } from '@/infrastructure/config/env';
import type { SessionUser } from '@/shared/types';
import { meetsRequirement, type AccessRequirement } from '@/features/auth/permissions';
import { decodeSession, readSessionCookie } from '@/features/auth/api/session-cookie';
import { sessionState, type AppCoreSessionData } from '@/features/auth/api/session-data';

/**
 * Server-side session access for server components, server actions and route
 * handlers. proxy.ts has already refreshed the token for this request.
 */
export async function getSession(): Promise<AppCoreSessionData | null> {
  const raw = readSessionCookie((await cookies()).getAll());
  const token = await decodeSession(raw, env().AUTH_SECRET);
  const data = token?.appcore;
  if (!data || sessionState(data) !== 'active') return null;
  return data;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

/**
 * Protects a page: redirects to sign-in when there is no session, and to the
 * 403 page when the requirement is not met (UX layer — the backend decides).
 */
export async function requireUser(requirement?: AccessRequirement): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const path = (await headers()).get('x-pathname') ?? appConfig.app.homePath;
    redirect(`${appConfig.app.loginPath}?callbackUrl=${encodeURIComponent(path)}`);
  }
  if (requirement && !meetsRequirement(user, requirement)) redirect('/forbidden');
  return user;
}
