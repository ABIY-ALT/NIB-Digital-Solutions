import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';

/**
 * The behaviour every KeyValueStore shares with Redis, the production
 * reference. Run against the in-memory store by the unit tests and against the
 * PostgreSQL store by the API tests (real database). Every test works on keys
 * of its own, so a shared database stays usable.
 */
export function describeKeyValueStore(
  name: string,
  create: () => KeyValueStore | Promise<KeyValueStore>,
): void {
  describe(`${name} (KeyValueStore contract)`, () => {
    let store: KeyValueStore;
    let namespace: string;
    const key = (name: string): string => `${namespace}${name}`;

    /** A TTL in ms that started at `seconds` a moment ago. */
    const expectTtl = (ms: number, seconds: number): void => {
      expect(ms).toBeLessThanOrEqual(seconds * 1000);
      expect(ms).toBeGreaterThan(seconds * 1000 - 2000);
    };

    beforeAll(async () => {
      store = await create();
    });
    afterAll(async () => {
      await store.close();
    });
    beforeEach(() => {
      namespace = `contract:${randomUUID()}:`;
    });

    it('answers a ping', async () => {
      expect(await store.ping()).toBe(true);
    });

    it('reads back what it stores, and nothing for a missing key', async () => {
      expect(await store.get(key('missing'))).toBeNull();
      expect(await store.set(key('a'), 'one')).toBe(true);
      expect(await store.get(key('a'))).toBe('one');
      expect(await store.set(key('a'), 'two')).toBe(true);
      expect(await store.get(key('a'))).toBe('two');
    });

    it('sets a value only if the key is absent (SET NX)', async () => {
      expect(await store.set(key('lock'), 'first', { onlyIfAbsent: true, ttlSeconds: 60 })).toBe(
        true,
      );
      expect(await store.set(key('lock'), 'second', { onlyIfAbsent: true })).toBe(false);
      expect(await store.get(key('lock'))).toBe('first');
    });

    it('lets exactly one of many concurrent callers take a lock', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          store.set(key('race'), String(i), { onlyIfAbsent: true, ttlSeconds: 60 }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('reports the remaining time to live', async () => {
      expect(await store.ttl(key('missing'))).toBe(-2);
      await store.set(key('forever'), 'x');
      expect(await store.ttl(key('forever'))).toBe(-1);
      await store.set(key('minute'), 'x', { ttlSeconds: 60 });
      expectTtl(await store.ttl(key('minute')), 60);
      await store.expire(key('minute'), 30);
      expectTtl(await store.ttl(key('minute')), 30);
      await store.expire(key('forever'), 30);
      expectTtl(await store.ttl(key('forever')), 30);
      await store.expire(key('missing'), 30);
      expect(await store.ttl(key('missing'))).toBe(-2);
    });

    it('counts atomically, starting the expiry on the first hit only', async () => {
      const first = await store.increment(key('hits'), 60);
      expect(first.value).toBe(1);
      expectTtl(first.ttlMs, 60);
      const later = await Promise.all(
        Array.from({ length: 20 }, () => store.increment(key('hits'), 60)),
      );
      expect(later.map((r) => r.value).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 2),
      );
      // Later hits stay in the first hit's window: the TTL is not restarted.
      for (const result of later) expect(result.ttlMs).toBeLessThanOrEqual(first.ttlMs);
    });

    it('deletes keys of either kind and counts the ones that existed', async () => {
      await store.set(key('a'), '1');
      await store.set(key('b'), '2');
      await store.setAdd(key('s'), 'member');
      expect(await store.delete(key('a'), key('s'), key('missing'))).toBe(2);
      expect(await store.get(key('a'))).toBeNull();
      expect(await store.setMembers(key('s'))).toEqual([]);
      expect(await store.get(key('b'))).toBe('2');
      expect(await store.delete()).toBe(0);
    });

    it('deletes by prefix, taking the prefix literally', async () => {
      await store.set(key('cache:%_1'), 'x');
      await store.set(key('cache:%_2'), 'x');
      await store.setAdd(key('cache:%_set'), 'member');
      // Would match if % and _ were wildcards.
      await store.set(key('cache:a1'), 'x');
      await store.set(key('other'), 'x');
      expect(await store.deleteByPrefix(key('cache:%_'))).toBe(3);
      expect(await store.get(key('cache:%_1'))).toBeNull();
      expect(await store.setMembers(key('cache:%_set'))).toEqual([]);
      expect(await store.get(key('cache:a1'))).toBe('x');
      expect(await store.get(key('other'))).toBe('x');
    });

    it('keeps sets of distinct members', async () => {
      expect(await store.setMembers(key('roles'))).toEqual([]);
      await store.setAdd(key('roles'), 'a');
      await store.setAdd(key('roles'), 'b');
      await store.setAdd(key('roles'), 'a');
      expect((await store.setMembers(key('roles'))).sort()).toEqual(['a', 'b']);
      await store.setRemove(key('roles'), 'a');
      await store.setRemove(key('roles'), 'missing');
      expect(await store.setMembers(key('roles'))).toEqual(['b']);
    });

    it('gives a set one expiry, kept by additions without a TTL', async () => {
      await store.setAdd(key('plain'), 'x');
      expect(await store.ttl(key('plain'))).toBe(-1);
      await store.setAdd(key('sessions'), 's1', 60);
      expectTtl(await store.ttl(key('sessions')), 60);
      await store.setAdd(key('sessions'), 's2');
      expectTtl(await store.ttl(key('sessions')), 60);
      await store.setAdd(key('sessions'), 's3', 120);
      expectTtl(await store.ttl(key('sessions')), 120);
      expect((await store.setMembers(key('sessions'))).sort()).toEqual(['s1', 's2', 's3']);
    });

    it('forgets every kind of key once it expires', async () => {
      await store.set(key('short'), 'x', { ttlSeconds: 1 });
      await store.set(key('lock'), 'old', { ttlSeconds: 1, onlyIfAbsent: true });
      await store.increment(key('counter'), 1);
      await store.increment(key('counter'), 1);
      await store.setAdd(key('set'), 'old', 1);

      await sleep(1_200);

      expect(await store.get(key('short'))).toBeNull();
      expect(await store.ttl(key('short'))).toBe(-2);
      expect(await store.delete(key('short'))).toBe(0);

      expect(await store.set(key('lock'), 'new', { onlyIfAbsent: true })).toBe(true);
      expect(await store.get(key('lock'))).toBe('new');
      expect(await store.ttl(key('lock'))).toBe(-1);

      const restarted = await store.increment(key('counter'), 60);
      expect(restarted.value).toBe(1);
      expectTtl(restarted.ttlMs, 60);

      expect(await store.setMembers(key('set'))).toEqual([]);
      await store.setAdd(key('set'), 'new');
      expect(await store.setMembers(key('set'))).toEqual(['new']);
      expect(await store.ttl(key('set'))).toBe(-1);
    });
  });
}
