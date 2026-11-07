/**
 * Swappable cache abstraction. Features define their own key namespace,
 * TTL and invalidation rules; the implementation (Redis, memory) is hidden.
 */
export interface CachePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Removes every key starting with `prefix` (namespace invalidation). */
  deleteByPrefix(prefix: string): Promise<void>;
  /** Read-through helper: returns cached value or loads, stores and returns it. */
  wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
}

export const CACHE_PORT = Symbol('CachePort');

/** Per-feature cache policy, declared next to the feature that owns it. */
export interface CachePolicy {
  namespace: string;
  ttlSeconds: number;
}

export function cacheKey(policy: CachePolicy, ...parts: Array<string | number>): string {
  return [policy.namespace, ...parts].join(':');
}
