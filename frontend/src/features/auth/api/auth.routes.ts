import { AuthError } from 'next-auth';
import { appConfig } from '@/infrastructure/config/app.config';
import { rateLimit } from '@/infrastructure/security/rate-limit';
import { ApiClientError, isApiClientError } from '@/shared/errors/api-client-error';
import { safeRedirect } from '@/shared/lib/safe-redirect';
import { z } from 'zod';
import { loginSchema, mfaSchema } from '../schemas';
import { backend } from '@/infrastructure/api/backend';
import type { ApiSchemas } from '@/shared/api';
import type { BackendAuthOutcome } from '@/shared/types';
import { signIn, signOut } from './auth.config';
import { clearPendingPasswordChange, getPendingPasswordChange } from './password-change';
import { stashOutcome } from './sign-in-handoff';
import { publicApiRoute, readJson, validationError } from './api-route';
import type { SignInErrorCode, SignInOutcome } from '../types';

export type { SignInOutcome };

/**
 * Authentication API routes (Next.js BFF):
 *   POST /api/auth/login   { username, password, callbackUrl? }
 *   POST /api/auth/mfa     { code, callbackUrl? }
 *   POST /api/auth/logout  { reason? }
 *
 * They run Auth.js server-side, which calls the NestJS API (/auth/login,
 * /auth/mfa/verify, /auth/logout) and stores the backend tokens in the
 * encrypted httpOnly session cookie. The browser only gets the outcome.
 */

const SIGN_IN_STATUS: Record<SignInErrorCode, number> = {
  invalid_credentials: 401,
  account_locked: 423,
  account_disabled: 403,
  mfa_required: 401,
  mfa_invalid: 401,
  mfa_expired: 401,
  mfa_too_many: 429,
  password_change_required: 401,
  password_change_expired: 401,
  rate_limited: 429,
  unavailable: 503,
};

function signInError(code: SignInErrorCode, retryAfterSeconds?: number): ApiClientError {
  return new ApiClientError({
    code,
    message: code,
    status: SIGN_IN_STATUS[code],
    retryAfterSeconds,
  });
}

function codeFrom(errorOrUrl: unknown): SignInErrorCode | null {
  if (errorOrUrl instanceof AuthError) {
    return (
      ((errorOrUrl as AuthError & { code?: string }).code as SignInErrorCode | undefined) ??
      'invalid_credentials'
    );
  }
  if (typeof errorOrUrl === 'string' && errorOrUrl.includes('error=')) {
    return (
      // The base only resolves a relative redirect URL; it is never requested.
      (new URL(errorOrUrl, 'https://local').searchParams.get('code') as SignInErrorCode | null) ??
      'invalid_credentials'
    );
  }
  return null;
}

/** Runs the Auth.js credentials flow and maps its result to a BFF outcome. */
async function credentialsSignIn(
  credentials: Record<string, string>,
  callbackUrl?: string,
): Promise<SignInOutcome> {
  const redirectTo = safeRedirect(callbackUrl, appConfig.app.homePath);
  let result: unknown;
  try {
    result = await signIn('credentials', { ...credentials, redirect: false });
  } catch (error) {
    const code = codeFrom(error);
    if (!code) throw error;
    result = `?error=CredentialsSignin&code=${code}`;
  }
  const code = codeFrom(result);
  const next = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : '';
  if (code === 'mfa_required') {
    return { status: 'MFA_REQUIRED', redirectTo: `${appConfig.app.loginPath}/mfa${next}` };
  }
  if (code === 'password_change_required') {
    return {
      status: 'PASSWORD_CHANGE_REQUIRED',
      redirectTo: `${appConfig.app.loginPath}/password${next}`,
    };
  }
  if (code) throw signInError(code);
  return { status: 'AUTHENTICATED', redirectTo };
}

const loginBody = loginSchema.extend({ callbackUrl: z.string().max(2048).optional() });
const mfaBody = mfaSchema.extend({ callbackUrl: z.string().max(2048).optional() });

export const login = publicApiRoute<SignInOutcome>(async ({ req, clientIp }) => {
  const limit = rateLimit(`login:${clientIp}`, 10, 60);
  if (!limit.allowed) throw signInError('rate_limited', limit.retryAfterSeconds);
  const body = await readJson(req, (v) => {
    const r = loginBody.safeParse(v);
    if (!r.success) throw validationError(r.error.issues);
    return r.data;
  });
  return {
    data: await credentialsSignIn(
      { username: body.username, password: body.password },
      body.callbackUrl,
    ),
  };
});

export const verifyMfa = publicApiRoute<SignInOutcome>(async ({ req, clientIp }) => {
  const limit = rateLimit(`mfa:${clientIp}`, 10, 60);
  if (!limit.allowed) throw signInError('rate_limited', limit.retryAfterSeconds);
  const body = await readJson(req, (v) => {
    const r = mfaBody.safeParse(v);
    if (!r.success) throw signInError('mfa_invalid');
    return r.data;
  });
  return { data: await credentialsSignIn({ code: body.code }, body.callbackUrl) };
});

const passwordChangeBody = z.object({
  newPassword: z.string().min(1).max(256),
  callbackUrl: z.string().max(2048).optional(),
});

/**
 * POST /api/auth/password — sets the new password required during sign-in.
 * Called directly (not through Auth.js) so policy violations reach the form
 * field by field; the resulting session is then handed to Auth.js.
 */
export const completePasswordChange = publicApiRoute<SignInOutcome>(async ({ req, clientIp }) => {
  const limit = rateLimit(`pwd-change:${clientIp}`, 10, 60);
  if (!limit.allowed) throw signInError('rate_limited', limit.retryAfterSeconds);
  const body = await readJson(req, (v) => {
    const r = passwordChangeBody.safeParse(v);
    if (!r.success) throw validationError(r.error.issues);
    return r.data;
  });
  const pending = await getPendingPasswordChange();
  if (!pending) throw signInError('password_change_expired');

  let outcome: BackendAuthOutcome;
  try {
    outcome = (
      await backend().post<BackendAuthOutcome>('/auth/password/change', {
        changeToken: pending.changeToken,
        newPassword: body.newPassword,
      })
    ).data;
  } catch (error) {
    if (isApiClientError(error) && error.code === 'AUTH_PASSWORD_CHANGE_INVALID') {
      await clearPendingPasswordChange();
      throw signInError('password_change_expired');
    }
    throw error; // VALIDATION_FAILED carries the broken policy rules per field
  }
  await clearPendingPasswordChange();
  return { data: await credentialsSignIn({ handoff: stashOutcome(outcome) }, body.callbackUrl) };
});

const forgotBody = z.object({ identifier: z.string().trim().min(1).max(254) });

/**
 * POST /api/auth/password/forgot — asks for a reset link by e-mail. Always
 * succeeds: whether the account exists is never revealed.
 */
export const forgotPassword = publicApiRoute<null>(async ({ req, api, clientIp }) => {
  const limit = rateLimit(`pwd-forgot:${clientIp}`, 5, 300);
  if (!limit.allowed) throw signInError('rate_limited', limit.retryAfterSeconds);
  const body = await readJson(req, (v) => {
    const r = forgotBody.safeParse(v);
    if (!r.success) throw validationError(r.error.issues);
    return r.data;
  });
  await api.post('/auth/password/forgot', body);
  return { data: null };
});

const resetBody = z.object({
  token: z.string().min(20).max(128),
  newPassword: z.string().min(1).max(256),
});

/**
 * POST /api/auth/password/reset — sets a new password with the e-mailed link.
 * No session is created: the user signs in afterwards (MFA still applies).
 */
export const resetPassword = publicApiRoute<null>(async ({ req, api, clientIp }) => {
  const limit = rateLimit(`pwd-reset:${clientIp}`, 10, 300);
  if (!limit.allowed) throw signInError('rate_limited', limit.retryAfterSeconds);
  const body = await readJson(req, (v) => {
    const r = resetBody.safeParse(v);
    if (!r.success) throw validationError(r.error.issues);
    return r.data;
  });
  // VALIDATION_FAILED carries the broken policy rules per field.
  await api.post('/auth/password/reset', body);
  return { data: null };
});

/** GET /api/auth/password-policy — public password rules for the live checklist. */
export const passwordPolicy = publicApiRoute<ApiSchemas['PasswordPolicy']>(async ({ api }) => {
  const res = await api.get<ApiSchemas['PasswordPolicy']>('/auth/password-policy');
  return { data: res.data };
});

const logoutBody = z.object({ reason: z.enum(['idle', 'expired']).optional() });

export const logout = publicApiRoute<{ redirectTo: string }>(async ({ req }) => {
  const body = await readJson(req, (v) => logoutBody.safeParse(v ?? {}).data ?? {}).catch(() => ({
    reason: undefined,
  }));
  // Auth.js signOut → events.signOut → NestJS /auth/logout (ends the backend session).
  await signOut({ redirect: false });
  const reason = body.reason ?? 'signed_out';
  return { data: { redirectTo: `${appConfig.app.loginPath}?reason=${reason}` } };
});
