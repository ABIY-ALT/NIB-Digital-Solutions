import type { ApiSchemas } from '@/shared/api';

/**
 * The user as exposed to the browser. Contains NO tokens — only what the UI
 * needs to render and to hide/disable elements (UX-level authorization).
 */
export interface SessionUser {
  id: string;
  username: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  branchCode: string | null;
  mfaEnabled: boolean;
}

/** Profile returned by the backend (/auth/me, login) — shared contract. */
export type UserProfile = ApiSchemas['UserProfile'];

/** Tokens issued by the backend. SERVER-SIDE ONLY (kept inside the encrypted session). */
export interface BackendTokens {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  idleTimeoutSeconds: number;
}

export type BackendAuthOutcome =
  | { status: 'AUTHENTICATED'; tokens: BackendTokens; user: UserProfile }
  | {
      status: 'MFA_REQUIRED';
      mfa: {
        challengeId: string;
        method: 'TOTP' | 'SMS';
        expiresAt: string;
        deliveryHint?: string;
      };
    }
  | {
      status: 'PASSWORD_CHANGE_REQUIRED';
      passwordChange: { changeToken: string; reason: 'EXPIRED' | 'RESET'; expiresAt: string };
    };
