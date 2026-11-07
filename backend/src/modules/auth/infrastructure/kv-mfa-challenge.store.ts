import { Inject, Injectable } from '@nestjs/common';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import type { MfaChallenge, MfaChallengeStore } from '../application/ports/auth.ports.js';

@Injectable()
export class KeyValueMfaChallengeStore implements MfaChallengeStore {
  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  async create(challenge: MfaChallenge, ttlSeconds: number): Promise<void> {
    await this.kv.set(`mfa:${challenge.id}`, JSON.stringify(challenge), { ttlSeconds });
  }

  async find(id: string): Promise<MfaChallenge | null> {
    const raw = await this.kv.get(`mfa:${id}`);
    return raw ? (JSON.parse(raw) as MfaChallenge) : null;
  }

  async update(challenge: MfaChallenge): Promise<void> {
    const ttlSeconds = Math.max(
      1,
      Math.ceil((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000),
    );
    await this.kv.set(`mfa:${challenge.id}`, JSON.stringify(challenge), { ttlSeconds });
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(`mfa:${id}`);
  }
}
