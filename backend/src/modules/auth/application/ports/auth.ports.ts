import type { User } from '#modules/users/domain/user.entity.js';
import type { AuthMethod, AuthSession } from '#modules/auth/domain/auth-session.js';

// ── Access tokens ─────────────────────────────────────────────────────────────

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  username: string;
  roles: string[];
  permissions: string[];
  attributes: Record<string, string | null>;
  mfa: boolean;
  amr: AuthMethod;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/** Issues and verifies access tokens (JWT). Swappable for an external IdP's tokens. */
export interface AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<IssuedToken>;
  verify(token: string): Promise<AccessTokenClaims>;
}
export const ACCESS_TOKEN_SERVICE = Symbol('AccessTokenService');

// ── Refresh tokens ────────────────────────────────────────────────────────────

export interface RefreshTokenCodec {
  /** Creates an opaque refresh token bound to a session plus the hash to store. */
  generate(sessionId: string): { token: string; hash: string };
  /** Extracts the session id and hash; null when malformed. */
  parse(token: string): { sessionId: string; hash: string } | null;
}
export const REFRESH_TOKEN_CODEC = Symbol('RefreshTokenCodec');

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionStore {
  save(session: AuthSession): Promise<void>;
  find(sessionId: string): Promise<AuthSession | null>;
  delete(sessionId: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<number>;
  listForUser(userId: string): Promise<AuthSession[]>;
}
export const SESSION_STORE = Symbol('SessionStore');

// ── Identity providers ────────────────────────────────────────────────────────

export type IdentityRequest =
  | { type: 'password'; username: string; password: string }
  | { type: 'external'; provider: string; token: string };

export interface VerifiedIdentity {
  user: User;
  method: AuthMethod;
  provider: string;
  /** True when the IdP already performed MFA (e.g. `amr` contains "mfa"). */
  mfaSatisfied: boolean;
}

/**
 * Pluggable identity provider. The local password provider ships by default; an
 * OIDC provider validates tokens from any compliant IdP (Keycloak, Entra ID, ...).
 */
export interface IdentityProvider {
  readonly id: string;
  supports(request: IdentityRequest): boolean;
  authenticate(request: IdentityRequest): Promise<VerifiedIdentity>;
}
export const IDENTITY_PROVIDERS = Symbol('IdentityProviders');

// ── MFA ───────────────────────────────────────────────────────────────────────

export type MfaMethodName = 'TOTP' | 'SMS';

export interface MfaChallenge {
  id: string;
  userId: string;
  method: MfaMethodName;
  attempts: number;
  authMethod: AuthMethod;
  provider: string;
  expiresAt: string;
  /** Provider-specific state (e.g. hash of an SMS code). */
  state?: Record<string, string>;
}

export interface MfaInitiation {
  /** Safe hint for the UI, e.g. "SMS sent to ••••1234". */
  deliveryHint?: string;
  state?: Record<string, string>;
}

/** Pluggable second factor (TOTP, SMS, ...). */
export interface MfaProvider {
  readonly method: MfaMethodName;
  initiate(user: User, challengeId: string): Promise<MfaInitiation>;
  verify(user: User, code: string, challenge: MfaChallenge): Promise<boolean>;
}
export const MFA_PROVIDERS = Symbol('MfaProviders');

export interface MfaChallengeStore {
  create(challenge: MfaChallenge, ttlSeconds: number): Promise<void>;
  find(id: string): Promise<MfaChallenge | null>;
  update(challenge: MfaChallenge): Promise<void>;
  delete(id: string): Promise<void>;
}
export const MFA_CHALLENGE_STORE = Symbol('MfaChallengeStore');

// ── Forced password change during sign-in ─────────────────────────────────────

/**
 * Issued when a user authenticated (all factors) but must set a new password
 * first (expired, or temporary after an administrator reset). The BFF keeps
 * the token in a sealed httpOnly cookie; it never reaches the browser.
 */
export interface PasswordChangeChallenge {
  id: string;
  userId: string;
  reason: 'EXPIRED' | 'RESET';
  authMethod: AuthMethod;
  provider: string;
  mfaVerified: boolean;
  expiresAt: string;
}

export interface PasswordChangeChallengeStore {
  create(challenge: PasswordChangeChallenge, ttlSeconds: number): Promise<void>;
  find(id: string): Promise<PasswordChangeChallenge | null>;
  delete(id: string): Promise<void>;
}
export const PASSWORD_CHANGE_STORE = Symbol('PasswordChangeChallengeStore');

/** Self-service password reset links (only the hash of a token is ever stored). */
export interface PasswordResetStore {
  /** False while a reset e-mail was sent to this user less than `seconds` ago. */
  acquireCooldown(userId: string, seconds: number): Promise<boolean>;
  /** Stores a token for the user and invalidates their previous one. */
  issue(userId: string, tokenHash: string, ttlSeconds: number): Promise<void>;
  /** The user a valid token belongs to. */
  find(tokenHash: string): Promise<string | null>;
  /** Removes the token; true for the one caller that removed it. */
  consume(tokenHash: string): Promise<boolean>;
  /** Invalidates the user's outstanding token. */
  revoke(userId: string): Promise<void>;
}
export const PASSWORD_RESET_STORE = Symbol('PasswordResetStore');

// ── Auth settings (application-level view of configuration) ──────────────────

export interface AuthSettings {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  refreshReuseGraceSeconds: number;
  sessionIdleTimeoutSeconds: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  mfaChallengeTtlSeconds: number;
  mfaMaxAttempts: number;
  passwordReset: {
    enabled: boolean;
    ttlSeconds: number;
    cooldownSeconds: number;
    /** Browser-facing product URL the e-mailed link points to. */
    publicUrl: string;
  };
}
export const AUTH_SETTINGS = Symbol('AuthSettings');
