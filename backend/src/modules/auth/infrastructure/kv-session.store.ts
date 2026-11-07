import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SessionTerminator } from '#core/application/ports/session-terminator.port.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import { AuthSession, type AuthSessionProps } from '../domain/auth-session.js';
import type { SessionStore } from '../application/ports/auth.ports.js';

type StoredSession = Omit<
  AuthSessionProps,
  'rotatedAt' | 'createdAt' | 'lastActivityAt' | 'expiresAt'
> & {
  rotatedAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
};

/**
 * Sessions in Redis (or the dev memory store):
 *   session:<id>           → JSON, TTL = remaining absolute lifetime
 *   user-sessions:<userId> → set of session ids (for "log out everywhere" / revocation)
 */
@Injectable()
export class KeyValueSessionStore implements SessionStore, SessionTerminator {
  private readonly logger = new Logger('SessionStore');

  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  async save(session: AuthSession): Promise<void> {
    const props = session.toJSON();
    const ttlSeconds = Math.max(1, Math.ceil((props.expiresAt.getTime() - Date.now()) / 1000));
    const stored: StoredSession = {
      ...props,
      rotatedAt: props.rotatedAt?.toISOString() ?? null,
      createdAt: props.createdAt.toISOString(),
      lastActivityAt: props.lastActivityAt.toISOString(),
      expiresAt: props.expiresAt.toISOString(),
    };
    await this.kv.set(`session:${props.id}`, JSON.stringify(stored), { ttlSeconds });
    await this.kv.setAdd(`user-sessions:${props.userId}`, props.id, ttlSeconds);
  }

  async find(sessionId: string): Promise<AuthSession | null> {
    const raw = await this.kv.get(`session:${sessionId}`);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return AuthSession.restore({
      ...s,
      rotatedAt: s.rotatedAt ? new Date(s.rotatedAt) : null,
      createdAt: new Date(s.createdAt),
      lastActivityAt: new Date(s.lastActivityAt),
      expiresAt: new Date(s.expiresAt),
    });
  }

  async delete(sessionId: string): Promise<void> {
    const session = await this.find(sessionId);
    await this.kv.delete(`session:${sessionId}`);
    if (session) await this.kv.setRemove(`user-sessions:${session.userId}`, sessionId);
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const ids = await this.kv.setMembers(`user-sessions:${userId}`);
    if (ids.length) await this.kv.delete(...ids.map((id) => `session:${id}`));
    await this.kv.delete(`user-sessions:${userId}`);
    return ids.length;
  }

  async listForUser(userId: string): Promise<AuthSession[]> {
    const ids = await this.kv.setMembers(`user-sessions:${userId}`);
    const sessions = await Promise.all(ids.map((id) => this.find(id)));
    return sessions.filter((s): s is AuthSession => s !== null);
  }

  async terminateAllForUser(userId: string, reason: string): Promise<number> {
    const count = await this.deleteAllForUser(userId);
    if (count) this.logger.log({ userId, reason, count }, 'Terminated user sessions');
    return count;
  }
}
