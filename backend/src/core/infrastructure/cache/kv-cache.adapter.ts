import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CachePort } from '#core/application/ports/cache.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '../kv/key-value-store.js';

const CACHE_NS = 'cache:';

/**
 * CachePort implementation on top of the KeyValueStore (Redis in production).
 * Values are JSON-serialised. Cache failures degrade to cache misses — they
 * never fail the business operation.
 */
@Injectable()
export class KeyValueCacheAdapter implements CachePort {
  private readonly logger = new Logger(KeyValueCacheAdapter.name);
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.store.get(CACHE_NS + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Cache read failed; treating as miss');
      return undefined;
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds = this.config.cache.defaultTtlSeconds,
  ): Promise<void> {
    try {
      await this.store.set(CACHE_NS + key, JSON.stringify(value), { ttlSeconds });
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Cache write failed');
    }
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(CACHE_NS + key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    await this.store.deleteByPrefix(CACHE_NS + prefix);
  }

  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    // Collapse concurrent misses for the same key into one load (stampede protection).
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const load = (async () => {
      try {
        const value = await loader();
        await this.set(key, value, ttlSeconds);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, load);
    return load;
  }
}
