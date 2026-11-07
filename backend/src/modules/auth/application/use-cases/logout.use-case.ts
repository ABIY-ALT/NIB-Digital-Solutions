import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { SESSION_STORE, type SessionStore } from '../ports/auth.ports.js';

export interface LogoutInput {
  principal: Principal;
  /** End every session of the user (all devices). */
  allSessions?: boolean;
}

@Injectable()
export class LogoutUseCase implements UseCase<LogoutInput, { terminated: number }> {
  constructor(@Inject(SESSION_STORE) private readonly sessions: SessionStore) {}

  async execute({ principal, allSessions }: LogoutInput): Promise<{ terminated: number }> {
    if (allSessions) return { terminated: await this.sessions.deleteAllForUser(principal.userId) };
    await this.sessions.delete(principal.sessionId);
    return { terminated: 1 };
  }
}
