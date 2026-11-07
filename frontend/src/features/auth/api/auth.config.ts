import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { appConfig } from '@/infrastructure/config/app.config';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { AppCoreSignInError, signInCodeFor } from '@/features/auth/api/sign-in-errors';
import { clearPendingMfa, getPendingMfa, setPendingMfa } from '@/features/auth/api/mfa-challenge';
import {
  clearPendingPasswordChange,
  setPendingPasswordChange,
} from '@/features/auth/api/password-change';
import { takeOutcome } from '@/features/auth/api/sign-in-handoff';
import { SESSION_COOKIE, sessionCookieOptions } from '@/features/auth/api/session-cookie';
import {
  sessionState,
  toSessionData,
  toSessionUser,
  type AppCoreSessionData,
} from '@/features/auth/api/session-data';
import { backend } from '@/infrastructure/api/backend';
import { env } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import type { BackendAuthOutcome } from '@/shared/types';

/**
 * Auth.js (v5) configuration.
 *
 *  • Session = encrypted JWT in an httpOnly cookie (opaque to the browser).
 *  • Backend tokens live only inside that encrypted cookie.
 *  • Credentials provider → AppCore backend (/auth/login, /auth/mfa/verify).
 *  • Optional generic OIDC provider (any compliant IdP); its ID token is
 *    exchanged for an AppCore session (/auth/token/exchange).
 *  • Token refresh happens in proxy.ts; idle timeout is enforced here and in the proxy.
 */
const sessionMaxAge = appConfig.auth.sessionMaxAgeHours * 3600;
const idleTimeoutSeconds = appConfig.auth.idleTimeoutMinutes * 60;

async function completeOutcome(outcome: BackendAuthOutcome): Promise<AppCoreSessionData> {
  if (outcome.status === 'MFA_REQUIRED') {
    await setPendingMfa(outcome.mfa);
    throw new AppCoreSignInError('mfa_required');
  }
  await clearPendingMfa();
  if (outcome.status === 'PASSWORD_CHANGE_REQUIRED') {
    await setPendingPasswordChange(outcome.passwordChange);
    throw new AppCoreSignInError('password_change_required');
  }
  await clearPendingPasswordChange();
  return toSessionData(outcome.tokens, toSessionUser(outcome.user), idleTimeoutSeconds);
}

function rethrow(error: unknown): never {
  if (error instanceof AppCoreSignInError) throw error;
  if (isApiClientError(error)) {
    logger.warn(
      { code: error.code, correlationId: error.correlationId },
      'Sign-in rejected by backend',
    );
    throw new AppCoreSignInError(signInCodeFor(error.code));
  }
  logger.error({ err: error }, 'Sign-in failed');
  throw new AppCoreSignInError('unavailable');
}

/** The `?error=` code for a failed single sign-on exchange. */
function signInFailureCode(error: unknown): string {
  if (error instanceof AppCoreSignInError) return error.code;
  return isApiClientError(error) ? signInCodeFor(error.code) : 'unavailable';
}

function buildConfig(): NextAuthConfig {
  const e = env();
  const providers: NextAuthConfig['providers'] = [
    Credentials({
      id: 'credentials',
      credentials: { username: {}, password: {}, code: {}, handoff: {} },
      async authorize(credentials) {
        const code = typeof credentials.code === 'string' ? credentials.code.trim() : '';
        const handoff = typeof credentials.handoff === 'string' ? credentials.handoff : '';
        try {
          let outcome: BackendAuthOutcome;
          if (handoff) {
            // Outcome already obtained by a BFF route in this request (forced password change).
            const stashed = takeOutcome(handoff);
            if (!stashed) throw new AppCoreSignInError('password_change_expired');
            outcome = stashed;
          } else if (code) {
            const pending = await getPendingMfa();
            if (!pending) throw new AppCoreSignInError('mfa_expired');
            outcome = (
              await backend().post<BackendAuthOutcome>('/auth/mfa/verify', {
                challengeId: pending.challengeId,
                code,
              })
            ).data;
          } else {
            outcome = (
              await backend().post<BackendAuthOutcome>('/auth/login', {
                username: String(credentials.username ?? ''),
                password: String(credentials.password ?? ''),
              })
            ).data;
          }
          const data = await completeOutcome(outcome);
          return { id: data.user.id, name: data.user.name, email: data.user.email, appcore: data };
        } catch (error) {
          if (
            isApiClientError(error) &&
            ['AUTH_MFA_CHALLENGE_INVALID', 'AUTH_MFA_TOO_MANY_ATTEMPTS'].includes(error.code)
          ) {
            await clearPendingMfa();
          }
          return rethrow(error);
        }
      },
    }),
  ];

  if (e.oidcEnabled) {
    providers.push({
      id: 'oidc',
      name: e.AUTH_OIDC_NAME,
      type: 'oidc',
      issuer: e.AUTH_OIDC_ISSUER,
      clientId: e.AUTH_OIDC_CLIENT_ID,
      clientSecret: e.AUTH_OIDC_CLIENT_SECRET,
      checks: ['pkce', 'state', 'nonce'],
    });
  }

  return {
    secret: e.AUTH_SECRET,
    trustHost: true,
    basePath: '/api/auth',
    session: { strategy: 'jwt', maxAge: sessionMaxAge },
    jwt: { maxAge: sessionMaxAge },
    cookies: {
      sessionToken: { name: SESSION_COOKIE, options: sessionCookieOptions(sessionMaxAge) },
    },
    pages: { signIn: appConfig.app.loginPath, error: appConfig.app.loginPath },
    providers,
    callbacks: {
      /** OIDC: exchange the IdP ID token for an AppCore backend session. */
      async signIn({ user, account }) {
        if (account?.provider !== 'oidc') return true;
        try {
          const outcome = (
            await backend().post<BackendAuthOutcome>('/auth/token/exchange', {
              provider: e.AUTH_OIDC_BACKEND_PROVIDER,
              token: account.id_token,
            })
          ).data;
          (user as { appcore?: AppCoreSessionData }).appcore = await completeOutcome(outcome);
          return true;
        } catch (error) {
          if (error instanceof AppCoreSignInError && error.code === 'mfa_required')
            return `${appConfig.app.loginPath}/mfa`;
          if (error instanceof AppCoreSignInError && error.code === 'password_change_required')
            return `${appConfig.app.loginPath}/password`;
          return `${appConfig.app.loginPath}?error=${signInFailureCode(error)}`;
        }
      },

      async jwt({ token, user, trigger, session }) {
        const incoming = (user as { appcore?: AppCoreSessionData } | undefined)?.appcore;
        if (incoming) {
          token.sub = incoming.user.id;
          token.appcore = incoming;
          return token;
        }
        const data = token.appcore as AppCoreSessionData | undefined;
        if (!data) return null;
        // Client-reported activity (IdleTimeout keep-alive).
        if (trigger === 'update' && (session as { activity?: boolean } | undefined)?.activity) {
          data.lastActivity = Date.now();
        }
        if (sessionState(data) !== 'active') return null;
        return token;
      },

      /** Only safe, non-secret fields reach the browser. */
      session({ session, token }) {
        const data = token.appcore as AppCoreSessionData | undefined;
        if (data) {
          Object.assign(session, {
            user: { ...data.user, image: null },
            idleTimeoutSeconds: data.idleTimeoutSeconds,
          });
        }
        return session;
      },
    },
    events: {
      /** End the backend session too. */
      async signOut(message) {
        const data =
          'token' in message
            ? (message.token?.appcore as AppCoreSessionData | undefined)
            : undefined;
        if (!data) return;
        try {
          await backend().post('/auth/logout', {}, { accessToken: data.accessToken });
        } catch (error) {
          logger.warn(
            { err: String(error) },
            'Backend logout failed (session will expire on its own)',
          );
        }
      },
    },
    logger: {
      error: (error) => logger.error({ err: error.message, name: error.name }, 'Auth.js error'),
      warn: (code) => logger.warn({ code }, 'Auth.js warning'),
      debug: () => {},
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
