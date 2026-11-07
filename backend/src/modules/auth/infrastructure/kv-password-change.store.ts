import { Inject, Injectable } from '@nestjs/common';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import type {
  PasswordChangeChallenge,
  PasswordChangeChallengeStore,
} from '../application/ports/auth.ports.js';

/** Short-lived "set a new password before your session starts" challenges. */
@Injectable()
export class KeyValuePasswordChangeStore implements PasswordChangeChallengeStore {
  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  async create(challenge: PasswordChangeChallenge, ttlSeconds: number): Promise<void> {
    await this.kv.set(`pwd-change:${challenge.id}`, JSON.stringify(challenge), { ttlSeconds });
  }

  async find(id: string): Promise<PasswordChangeChallenge | null> {
    const raw = await this.kv.get(`pwd-change:${id}`);
    return raw ? (JSON.parse(raw) as PasswordChangeChallenge) : null;
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(`pwd-change:${id}`);
  }
}
