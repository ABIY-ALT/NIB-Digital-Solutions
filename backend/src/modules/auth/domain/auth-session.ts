export type AuthMethod = 'password' | 'external';

export interface AuthSessionProps {
  id: string;
  userId: string;
  username: string;
  /** Hash of the currently valid refresh token. */
  refreshTokenHash: string;
  /** Hash of the previous refresh token, accepted briefly to absorb concurrent refreshes. */
  previousRefreshTokenHash: string | null;
  rotatedAt: Date | null;
  createdAt: Date;
  lastActivityAt: Date;
  /** Absolute expiry: the session cannot be extended beyond this. */
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  mfaVerified: boolean;
  authMethod: AuthMethod;
  provider: string;
}

export type RefreshTokenMatch = 'current' | 'previous_within_grace' | 'reused';

/**
 * Server-side session (stored in Redis). Refresh tokens rotate on every use;
 * presenting an old token outside the grace window is treated as theft and
 * revokes the session (refresh token reuse detection).
 */
export class AuthSession {
  private constructor(private readonly props: AuthSessionProps) {}

  static start(
    input: Omit<
      AuthSessionProps,
      'previousRefreshTokenHash' | 'rotatedAt' | 'lastActivityAt' | 'createdAt'
    >,
    now: Date,
  ): AuthSession {
    return new AuthSession({
      ...input,
      previousRefreshTokenHash: null,
      rotatedAt: null,
      createdAt: now,
      lastActivityAt: now,
    });
  }

  static restore(props: AuthSessionProps): AuthSession {
    return new AuthSession({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get lastActivityAt(): Date {
    return this.props.lastActivityAt;
  }
  get mfaVerified(): boolean {
    return this.props.mfaVerified;
  }
  get authMethod(): AuthMethod {
    return this.props.authMethod;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  isExpired(now: Date): boolean {
    return this.props.expiresAt <= now;
  }

  isIdle(now: Date, idleTimeoutSeconds: number): boolean {
    return now.getTime() - this.props.lastActivityAt.getTime() > idleTimeoutSeconds * 1000;
  }

  idleExpiresAt(idleTimeoutSeconds: number): Date {
    return new Date(this.props.lastActivityAt.getTime() + idleTimeoutSeconds * 1000);
  }

  matchRefreshToken(hash: string, now: Date, graceSeconds: number): RefreshTokenMatch {
    if (hash === this.props.refreshTokenHash) return 'current';
    if (
      hash === this.props.previousRefreshTokenHash &&
      this.props.rotatedAt &&
      now.getTime() - this.props.rotatedAt.getTime() <= graceSeconds * 1000
    ) {
      return 'previous_within_grace';
    }
    return 'reused';
  }

  rotate(newHash: string, now: Date): void {
    this.props.previousRefreshTokenHash = this.props.refreshTokenHash;
    this.props.refreshTokenHash = newHash;
    this.props.rotatedAt = now;
    this.props.lastActivityAt = now;
  }

  /** Records activity. Returns true when the stored copy should be updated. */
  touch(now: Date, minIntervalSeconds = 60): boolean {
    if (now.getTime() - this.props.lastActivityAt.getTime() < minIntervalSeconds * 1000)
      return false;
    this.props.lastActivityAt = now;
    return true;
  }

  toJSON(): AuthSessionProps {
    return { ...this.props };
  }
}
