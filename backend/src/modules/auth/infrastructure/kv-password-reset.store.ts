import { Inject, Injectable } from '@nestjs/common';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import type { PasswordResetStore } from '../application/ports/auth.ports.js';

const token = (hash: string): string => `pwd-reset:token:${hash}`;
const current = (userId: string): string => `pwd-reset:user:${userId}`;
const cooldown = (userId: string): string => `pwd-reset:cooldown:${userId}`;

/**
 * E-mailed password reset links. One link per user is valid at a time: issuing
 * a new one, or using one, invalidates the previous.
 */
@Injectable()
export class KeyValuePasswordResetStore implements PasswordResetStore {
  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  async acquireCooldown(userId: string, seconds: number): Promise<boolean> {
    if (seconds <= 0) return true;
    return this.kv.set(cooldown(userId), '1', { ttlSeconds: seconds, onlyIfAbsent: true });
  }

  async issue(userId: string, tokenHash: string, ttlSeconds: number): Promise<void> {
    await this.revoke(userId);
    await this.kv.set(token(tokenHash), userId, { ttlSeconds });
    await this.kv.set(current(userId), tokenHash, { ttlSeconds });
  }

  find(tokenHash: string): Promise<string | null> {
    return this.kv.get(token(tokenHash));
  }

  async consume(tokenHash: string): Promise<boolean> {
    return (await this.kv.delete(token(tokenHash))) > 0;
  }

  async revoke(userId: string): Promise<void> {
    const hash = await this.kv.get(current(userId));
    await this.kv.delete(current(userId), ...(hash ? [token(hash)] : []));
  }
}
