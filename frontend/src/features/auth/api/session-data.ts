import type { BackendTokens, SessionUser, UserProfile } from '@/shared/types';

/**
 * What the BFF keeps inside the encrypted Auth.js session cookie (JWE).
 * The browser cannot read it (httpOnly + encrypted); tokens never leave the server.
 */
export interface AppCoreSessionData {
  user: SessionUser;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  backendSessionId: string;
  lastActivity: number;
  idleTimeoutSeconds: number;
}

export function toSessionUser(profile: UserProfile): SessionUser {
  return {
    id: profile.id,
    username: profile.username,
    name: profile.fullName,
    email: profile.email,
    roles: profile.roles,
    permissions: profile.permissions,
    branchCode: profile.branchCode,
    mfaEnabled: profile.mfaEnabled,
  };
}

export function toSessionData(
  tokens: BackendTokens,
  user: SessionUser,
  idleTimeoutSeconds: number,
): AppCoreSessionData {
  return {
    user,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: Date.parse(tokens.accessTokenExpiresAt),
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: Date.parse(tokens.refreshTokenExpiresAt),
    backendSessionId: tokens.sessionId,
    lastActivity: Date.now(),
    // The shorter of the product idle timeout and the backend idle timeout.
    idleTimeoutSeconds: Math.min(idleTimeoutSeconds, tokens.idleTimeoutSeconds),
  };
}

export type SessionState = 'active' | 'idle' | 'expired';

export function sessionState(data: AppCoreSessionData, now = Date.now()): SessionState {
  if (data.refreshTokenExpiresAt <= now) return 'expired';
  if (now - data.lastActivity > data.idleTimeoutSeconds * 1000) return 'idle';
  return 'active';
}
