import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { KEY_VALUE_STORE, type KeyValueStore } from '../kv/key-value-store.js';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Distributed rate-limit storage for @nestjs/throttler on the KeyValueStore
 * (Redis in production), so limits hold across all backend instances.
 */
@Injectable()
export class KeyValueThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `rl:${throttlerName}:${key}`;
    const blockKey = `${base}:blocked`;

    const blockedTtl = await this.kv.ttl(blockKey);
    if (blockedTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(blockedTtl / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockedTtl / 1000),
      };
    }

    const { value, ttlMs } = await this.kv.increment(base, Math.max(1, Math.ceil(ttl / 1000)));
    const timeToExpire = Math.max(0, Math.ceil(ttlMs / 1000));

    if (value > limit) {
      const blockSeconds = Math.max(1, Math.ceil(blockDuration / 1000));
      await this.kv.set(blockKey, '1', { ttlSeconds: blockSeconds });
      return { totalHits: value, timeToExpire, isBlocked: true, timeToBlockExpire: blockSeconds };
    }
    return { totalHits: value, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
