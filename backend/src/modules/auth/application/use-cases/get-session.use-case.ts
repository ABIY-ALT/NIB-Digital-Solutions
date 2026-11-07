import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import {
  AUTH_SETTINGS,
  SESSION_STORE,
  type AuthSettings,
  type SessionStore,
} from '../ports/auth.ports.js';

export interface SessionInfo {
  sessionId: string;
  userId: string;
  authMethod: string;
  mfaVerified: boolean;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  idleTimeoutSeconds: number;
}

/** Validates and describes the caller's session (used by the BFF for session checks). */
@Injectable()
export class GetSessionUseCase implements UseCase<Principal, SessionInfo> {
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  async execute(principal: Principal): Promise<SessionInfo> {
    const session = await this.sessions.find(principal.sessionId);
    if (!session) throw new AuthenticationError(ErrorCode.AUTH_SESSION_REVOKED);
    return {
      sessionId: session.id,
      userId: session.userId,
      authMethod: session.authMethod,
      mfaVerified: session.mfaVerified,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      idleExpiresAt: session.idleExpiresAt(this.settings.sessionIdleTimeoutSeconds),
      idleTimeoutSeconds: this.settings.sessionIdleTimeoutSeconds,
    };
  }
}
