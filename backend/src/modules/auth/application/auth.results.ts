import type { User } from '#modules/users/domain/user.entity.js';
import type { MfaMethodName } from './ports/auth.ports.js';

export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
  idleTimeoutSeconds: number;
}

export type AuthenticationOutcome =
  | { status: 'AUTHENTICATED'; tokens: AuthTokens; user: User }
  | {
      status: 'MFA_REQUIRED';
      challengeId: string;
      method: MfaMethodName;
      expiresAt: Date;
      deliveryHint?: string;
    }
  | {
      status: 'PASSWORD_CHANGE_REQUIRED';
      changeToken: string;
      reason: 'EXPIRED' | 'RESET';
      expiresAt: Date;
    };

export interface ClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}
