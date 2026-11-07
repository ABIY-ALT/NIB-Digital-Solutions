import { Inject, Injectable } from '@nestjs/common';
import type {
  IdempotencyBeginResult,
  IdempotencyStore,
  StoredResponse,
} from '#core/application/ports/idempotency.port.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '../kv/key-value-store.js';

interface IdempotencyRecord {
  status: 'processing' | 'completed';
  fingerprint: string;
  response?: StoredResponse;
}

/** How long a "processing" lock lives if the process dies mid-request. */
const PROCESSING_LOCK_SECONDS = 60;

/** IdempotencyStore on the KeyValueStore (Redis in production). */
@Injectable()
export class KeyValueIdempotencyStore implements IdempotencyStore {
  constructor(@Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore) {}

  private key(key: string): string {
    return `idem:${key}`;
  }

  async begin(
    key: string,
    fingerprint: string,
    _ttlSeconds: number,
  ): Promise<IdempotencyBeginResult> {
    const record: IdempotencyRecord = { status: 'processing', fingerprint };
    const acquired = await this.kv.set(this.key(key), JSON.stringify(record), {
      ttlSeconds: PROCESSING_LOCK_SECONDS,
      onlyIfAbsent: true,
    });
    if (acquired) return { state: 'started' };

    const raw = await this.kv.get(this.key(key));
    if (!raw) return this.begin(key, fingerprint, _ttlSeconds); // expired between calls
    const existing = JSON.parse(raw) as IdempotencyRecord;
    if (existing.fingerprint !== fingerprint) return { state: 'fingerprint_mismatch' };
    if (existing.status === 'completed' && existing.response) {
      return { state: 'completed', response: existing.response };
    }
    return { state: 'in_progress' };
  }

  async complete(
    key: string,
    fingerprint: string,
    response: StoredResponse,
    ttlSeconds: number,
  ): Promise<void> {
    const record: IdempotencyRecord = { status: 'completed', fingerprint, response };
    await this.kv.set(this.key(key), JSON.stringify(record), { ttlSeconds });
  }

  async release(key: string): Promise<void> {
    await this.kv.delete(this.key(key));
  }
}
