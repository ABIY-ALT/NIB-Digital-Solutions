import { isApiClientError } from '@/shared/errors/api-client-error';
import type { RequestMeta } from '@/infrastructure/api/backend-client';
import { backend } from '@/infrastructure/api/backend';
import { logger } from '@/infrastructure/logging/logger';
import type { BackendTokens, UserProfile } from '@/shared/types';
import { toSessionUser, type AppCoreSessionData } from '@/features/auth/api/session-data';

/**
 * Refreshes the backend access token shortly before it expires. Runs ONLY in
 * proxy.ts, the one place that can both forward the new cookie to the current
 * request and set it on the response.
 *
 * Concurrent requests carrying the same (old) refresh token share one refresh
 * call, so the backend never sees the old token twice (reuse detection).
 */
const inflight = new Map<
  string,
  { promise: Promise<AppCoreSessionData | null>; expires: number }
>();

export function needsRefresh(
  data: AppCoreSessionData,
  leewaySeconds: number,
  now = Date.now(),
): boolean {
  return data.accessTokenExpiresAt - now < leewaySeconds * 1000;
}

/** Returns the refreshed session, or null when the backend ended the session. */
export function refreshSession(
  data: AppCoreSessionData,
  meta: RequestMeta,
): Promise<AppCoreSessionData | null> {
  const now = Date.now();
  for (const [key, entry] of inflight) if (entry.expires < now) inflight.delete(key);

  const existing = inflight.get(data.refreshToken);
  if (existing) return existing.promise;

  const promise = (async () => {
    try {
      const { data: tokens } = await backend().post<BackendTokens>(
        '/auth/token/refresh',
        { refreshToken: data.refreshToken },
        { meta },
      );
      // Re-read the profile so role/permission changes reach the UI.
      const { data: profile } = await backend().get<UserProfile>('/auth/me', {
        accessToken: tokens.accessToken,
        meta,
      });
      logger.info({ correlationId: meta.correlationId, userId: profile.id }, 'Session refreshed');
      return {
        ...data,
        user: toSessionUser(profile),
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: Date.parse(tokens.accessTokenExpiresAt),
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt: Date.parse(tokens.refreshTokenExpiresAt),
      };
    } catch (error) {
      if (isApiClientError(error) && error.endsSession) {
        logger.warn(
          { correlationId: meta.correlationId, code: error.code },
          'Session ended by backend during refresh',
        );
        return null;
      }
      // Transient failure: keep the current token; it is still valid for the leeway window.
      logger.warn(
        { correlationId: meta.correlationId, err: String(error) },
        'Session refresh failed (transient)',
      );
      throw error;
    }
  })();

  inflight.set(data.refreshToken, { promise, expires: now + 30_000 });
  return promise;
}
