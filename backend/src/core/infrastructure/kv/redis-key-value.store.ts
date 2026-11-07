import { Redis } from 'ioredis';
import type { CounterResult, KeyValueStore, SetOptions } from './key-value-store.js';

const INCREMENT_SCRIPT = `
local v = redis.call('INCR', KEYS[1])
if v == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {v, ttl}
`;

/** Redis-backed KeyValueStore (production default). */
export class RedisKeyValueStore implements KeyValueStore {
  readonly driver = 'redis' as const;
  readonly client: Redis;

  constructor(
    url: string,
    private readonly prefix: string,
  ) {
    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      connectTimeout: 5_000,
    });
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  get(key: string): Promise<string | null> {
    return this.client.get(this.k(key));
  }

  async set(key: string, value: string, options: SetOptions = {}): Promise<boolean> {
    const fullKey = this.k(key);
    const ttl = options.ttlSeconds && options.ttlSeconds > 0 ? options.ttlSeconds : undefined;
    let result: string | null;
    if (ttl && options.onlyIfAbsent)
      result = await this.client.set(fullKey, value, 'EX', ttl, 'NX');
    else if (ttl) result = await this.client.set(fullKey, value, 'EX', ttl);
    else if (options.onlyIfAbsent) result = await this.client.set(fullKey, value, 'NX');
    else result = await this.client.set(fullKey, value);
    return result === 'OK';
  }

  async delete(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys.map((k) => this.k(k)));
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    const match = `${this.k(prefix)}*`;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', match, 'COUNT', 250);
      cursor = next;
      if (keys.length > 0) removed += await this.client.unlink(...keys);
    } while (cursor !== '0');
    return removed;
  }

  async increment(key: string, ttlSeconds: number): Promise<CounterResult> {
    const [value, ttlMs] = (await this.client.eval(
      INCREMENT_SCRIPT,
      1,
      this.k(key),
      String(ttlSeconds * 1000),
    )) as [number, number];
    return { value, ttlMs };
  }

  ttl(key: string): Promise<number> {
    return this.client.pttl(this.k(key));
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(this.k(key), ttlSeconds);
  }

  async setAdd(key: string, member: string, ttlSeconds?: number): Promise<void> {
    const fullKey = this.k(key);
    const pipeline = this.client.multi().sadd(fullKey, member);
    if (ttlSeconds) pipeline.expire(fullKey, ttlSeconds);
    await pipeline.exec();
  }

  async setRemove(key: string, member: string): Promise<void> {
    await this.client.srem(this.k(key), member);
  }

  setMembers(key: string): Promise<string[]> {
    return this.client.smembers(this.k(key));
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
