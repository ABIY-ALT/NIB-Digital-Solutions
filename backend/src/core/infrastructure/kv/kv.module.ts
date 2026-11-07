import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { KEY_VALUE_STORE, type KeyValueStore } from './key-value-store.js';
import { MemoryKeyValueStore } from './memory-key-value.store.js';
import { RedisKeyValueStore } from './redis-key-value.store.js';

/**
 * Provides the KeyValueStore selected by KV_STORE (redis | memory).
 */
@Global()
@Module({
  providers: [
    {
      provide: KEY_VALUE_STORE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): KeyValueStore => {
        const logger = new Logger('KeyValueStore');
        const { driver, redisUrl, keyPrefix } = config.kvStore;
        if (driver === 'redis' && redisUrl) {
          logger.log('Using Redis key/value store');
          return new RedisKeyValueStore(redisUrl, keyPrefix);
        }
        logger.warn(
          'Using IN-MEMORY key/value store (KV_STORE=memory). Sessions, rate limits and idempotency are per-process and reset on restart. Development only.',
        );
        return new MemoryKeyValueStore(keyPrefix);
      },
    },
  ],
  exports: [KEY_VALUE_STORE],
})
export class KeyValueModule implements OnApplicationShutdown {
  constructor(@Inject(KEY_VALUE_STORE) private readonly store: KeyValueStore) {}

  async onApplicationShutdown(): Promise<void> {
    await this.store.close();
  }
}
