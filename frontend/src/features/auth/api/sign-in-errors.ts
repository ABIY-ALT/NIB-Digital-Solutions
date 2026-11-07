import { CredentialsSignin } from 'next-auth';

import type { SignInErrorCode } from '../types';

export type { SignInErrorCode };

export class AppCoreSignInError extends CredentialsSignin {
  constructor(code: SignInErrorCode) {
    super();
    this.code = code;
  }
}

const BACKEND_TO_SIGNIN: Record<string, SignInErrorCode> = {
  AUTH_INVALID_CREDENTIALS: 'invalid_credentials',
  VALIDATION_FAILED: 'invalid_credentials',
  AUTH_ACCOUNT_LOCKED: 'account_locked',
  AUTH_ACCOUNT_DISABLED: 'account_disabled',
  AUTH_MFA_INVALID_CODE: 'mfa_invalid',
  AUTH_MFA_CHALLENGE_INVALID: 'mfa_expired',
  AUTH_MFA_TOO_MANY_ATTEMPTS: 'mfa_too_many',
  AUTH_PASSWORD_CHANGE_INVALID: 'password_change_expired',
  RATE_LIMITED: 'rate_limited',
  AUTH_EXTERNAL_IDENTITY_UNLINKED: 'account_disabled',
};

export function signInCodeFor(backendCode: string): SignInErrorCode {
  return BACKEND_TO_SIGNIN[backendCode] ?? 'unavailable';
}
