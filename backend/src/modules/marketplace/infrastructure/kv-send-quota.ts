import { Inject, Injectable } from '@nestjs/common';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import type { SendQuota } from '../application/marketplace.ports.js';

/** Send quota on the shared key/value store (Redis in production), so every instance counts together. */
@Injectable()
export class KvSendQuota implements SendQuota {
  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  async take(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const { value } = await this.kv.increment(key, windowSeconds);
    return value <= limit;
  }
}
