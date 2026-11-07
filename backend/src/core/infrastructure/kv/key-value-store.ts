/**
 * Low-level key/value abstraction used by every Redis-backed infrastructure
 * adapter (sessions, cache, idempotency, rate limiting, MFA challenges, replay
 * protection). Swapping Redis for another store means implementing this once.
 *
 * Keys passed in are logical; implementations add the configured prefix.
 */
export interface SetOptions {
  ttlSeconds?: number;
  /** Only set when the key does not exist (SET NX). Returns false if it existed. */
  onlyIfAbsent?: boolean;
}

export interface CounterResult {
  value: number;
  /** Remaining time-to-live in milliseconds. */
  ttlMs: number;
}

export interface KeyValueStore {
  readonly driver: 'redis' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: SetOptions): Promise<boolean>;
  delete(...keys: string[]): Promise<number>;
  deleteByPrefix(prefix: string): Promise<number>;
  /** Atomically increments a counter, starting its TTL on first increment. */
  increment(key: string, ttlSeconds: number): Promise<CounterResult>;
  /** Remaining TTL in ms, -1 if no expiry, -2 if missing. */
  ttl(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  setAdd(key: string, member: string, ttlSeconds?: number): Promise<void>;
  setRemove(key: string, member: string): Promise<void>;
  setMembers(key: string): Promise<string[]>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export const KEY_VALUE_STORE = Symbol('KeyValueStore');
