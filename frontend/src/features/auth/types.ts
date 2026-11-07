import type { ApiSchemas } from '@/shared/api';

/** Auth types shared by the BFF (server) and the sign-in UI (client). */

/**
 * Sign-in failures surfaced to the login UI by `code`. Messages are generic
 * and safe; the UI translates the code.
 */
export type SignInErrorCode =
  | 'invalid_credentials'
  | 'account_locked'
  | 'account_disabled'
  | 'mfa_required'
  | 'mfa_invalid'
  | 'mfa_expired'
  | 'mfa_too_many'
  | 'password_change_required'
  | 'password_change_expired'
  | 'rate_limited'
  | 'unavailable';

export interface SignInOutcome {
  status: 'AUTHENTICATED' | 'MFA_REQUIRED' | 'PASSWORD_CHANGE_REQUIRED';
  redirectTo: string;
}

/** Password rules shown while a new password is typed (from the backend policy). */
export type PasswordPolicy = ApiSchemas['PasswordPolicy'];
