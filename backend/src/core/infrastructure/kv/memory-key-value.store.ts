import type { CounterResult, KeyValueStore, SetOptions } from './key-value-store.js';

interface Entry {
  value: string | Set<string>;
  expiresAt: number | null;
}

/**
 * In-process KeyValueStore for local development and tests (no Redis needed).
 *
 * Limitations: data is lost on restart and is NOT shared between processes, so
 * sessions, rate limits and idempotency only hold within one instance. Startup
 * validation refuses this driver in production.
 */
export class MemoryKeyValueStore implements KeyValueStore {
  readonly driver = 'memory' as const;
  private readonly data = new Map<string, Entry>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly prefix: string) {
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref();
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  private live(fullKey: string): Entry | undefined {
    const entry = this.data.get(fullKey);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.data.delete(fullKey);
      return undefined;
    }
    return entry;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.data) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.data.delete(key);
    }
  }

  private expiry(ttlSeconds?: number): number | null {
    return ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
  }

  get(key: string): Promise<string | null> {
    const entry = this.live(this.k(key));
    return Promise.resolve(typeof entry?.value === 'string' ? entry.value : null);
  }

  set(key: string, value: string, options: SetOptions = {}): Promise<boolean> {
    const fullKey = this.k(key);
    if (options.onlyIfAbsent && this.live(fullKey)) return Promise.resolve(false);
    this.data.set(fullKey, { value, expiresAt: this.expiry(options.ttlSeconds) });
    return Promise.resolve(true);
  }

  delete(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.data.delete(this.k(key))) removed++;
    return Promise.resolve(removed);
  }

  deleteByPrefix(prefix: string): Promise<number> {
    const full = this.k(prefix);
    let removed = 0;
    // Deleting the current entry while iterating a Map is safe.
    for (const key of this.data.keys()) {
      if (key.startsWith(full)) {
        this.data.delete(key);
        removed++;
      }
    }
    return Promise.resolve(removed);
  }

  increment(key: string, ttlSeconds: number): Promise<CounterResult> {
    const fullKey = this.k(key);
    const entry = this.live(fullKey);
    if (!entry || typeof entry.value !== 'string') {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      this.data.set(fullKey, { value: '1', expiresAt });
      return Promise.resolve({ value: 1, ttlMs: ttlSeconds * 1000 });
    }
    const value = Number(entry.value) + 1;
    entry.value = String(value);
    return Promise.resolve({ value, ttlMs: entry.expiresAt ? entry.expiresAt - Date.now() : -1 });
  }

  ttl(key: string): Promise<number> {
    const entry = this.live(this.k(key));
    if (!entry) return Promise.resolve(-2);
    return Promise.resolve(entry.expiresAt === null ? -1 : entry.expiresAt - Date.now());
  }

  expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.live(this.k(key));
    if (entry) entry.expiresAt = this.expiry(ttlSeconds);
    return Promise.resolve();
  }

  setAdd(key: string, member: string, ttlSeconds?: number): Promise<void> {
    const fullKey = this.k(key);
    const entry = this.live(fullKey);
    if (entry && entry.value instanceof Set) {
      entry.value.add(member);
      if (ttlSeconds) entry.expiresAt = this.expiry(ttlSeconds);
    } else {
      this.data.set(fullKey, { value: new Set([member]), expiresAt: this.expiry(ttlSeconds) });
    }
    return Promise.resolve();
  }

  setRemove(key: string, member: string): Promise<void> {
    const entry = this.live(this.k(key));
    if (entry && entry.value instanceof Set) entry.value.delete(member);
    return Promise.resolve();
  }

  setMembers(key: string): Promise<string[]> {
    const entry = this.live(this.k(key));
    return Promise.resolve(entry && entry.value instanceof Set ? [...entry.value] : []);
  }

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    clearInterval(this.sweeper);
    this.data.clear();
    return Promise.resolve();
  }
}
