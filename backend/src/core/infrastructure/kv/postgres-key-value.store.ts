import { Logger } from '@nestjs/common';
import type { PrismaClient } from '#generated/prisma/client.js';
import type { CounterResult, KeyValueStore, SetOptions } from './key-value-store.js';

/** How often rows past their expiry are deleted. Until then they are only invisible. */
const SWEEP_INTERVAL_MS = 60_000;

interface TtlRow {
  ttl_ms: bigint;
}

/**
 * PostgreSQL-backed KeyValueStore (KV_STORE=postgres), for servers without
 * Redis. Like Redis, it is shared by every process on the same database and
 * survives restarts. Two tables (migration kv_store_postgres):
 *
 *   kv_entries      strings and counters
 *   kv_set_members  one row per set member; every member of a set carries the
 *                   set's expiry, as Redis keeps one TTL per key
 *
 * Expired rows are invisible to every read at once and are deleted by a sweep
 * once a minute. Each operation is one statement or one transaction, so an
 * increment or a "set only if absent" stays atomic across processes.
 *
 * Queries run on the root client, never inside an ambient business
 * transaction: as with Redis, a key written here stays written when the
 * surrounding transaction rolls back.
 */
export class PostgresKeyValueStore implements KeyValueStore {
  readonly driver = 'postgres' as const;
  private readonly logger = new Logger(PostgresKeyValueStore.name);
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly db: PrismaClient,
    private readonly prefix: string,
  ) {
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  /** Milliseconds for a positive TTL; null means "no expiry". */
  private static ttlMs(ttlSeconds?: number): number | null {
    return ttlSeconds && ttlSeconds > 0 ? ttlSeconds * 1000 : null;
  }

  async get(key: string): Promise<string | null> {
    const rows = await this.db.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM kv_entries
      WHERE key = ${this.k(key)} AND (expires_at IS NULL OR expires_at > now())`;
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string, options: SetOptions = {}): Promise<boolean> {
    const fullKey = this.k(key);
    const ttlMs = PostgresKeyValueStore.ttlMs(options.ttlSeconds);
    if (options.onlyIfAbsent) {
      // SET NX: insert, or take over a row that has expired; a live row wins.
      const rows = await this.db.$queryRaw<unknown[]>`
        INSERT INTO kv_entries AS e (key, value, expires_at)
        VALUES (${fullKey}, ${value}, now() + ${ttlMs}::float8 * interval '1 millisecond')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
          WHERE e.expires_at <= now()
        RETURNING 1 AS written`;
      return rows.length > 0;
    }
    await this.db.$executeRaw`
      INSERT INTO kv_entries (key, value, expires_at)
      VALUES (${fullKey}, ${value}, now() + ${ttlMs}::float8 * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
    return true;
  }

  async delete(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const fullKeys = keys.map((key) => this.k(key));
    // Like DEL: counts the keys that existed (expired ones did not).
    const rows = await this.db.$queryRaw<Array<{ removed: bigint }>>`
      WITH gone AS (
        DELETE FROM kv_entries WHERE key = ANY(${fullKeys}::text[]) RETURNING key, expires_at
      ), gone_sets AS (
        DELETE FROM kv_set_members WHERE key = ANY(${fullKeys}::text[]) RETURNING key, expires_at
      )
      SELECT count(DISTINCT key) AS removed
      FROM (SELECT key, expires_at FROM gone UNION ALL SELECT key, expires_at FROM gone_sets) AS d
      WHERE expires_at IS NULL OR expires_at > now()`;
    return Number(rows[0]?.removed ?? 0);
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    const fullPrefix = this.k(prefix);
    const rows = await this.db.$queryRaw<Array<{ removed: bigint }>>`
      WITH gone AS (
        DELETE FROM kv_entries WHERE starts_with(key, ${fullPrefix}) RETURNING key, expires_at
      ), gone_sets AS (
        DELETE FROM kv_set_members WHERE starts_with(key, ${fullPrefix}) RETURNING key, expires_at
      )
      SELECT count(DISTINCT key) AS removed
      FROM (SELECT key, expires_at FROM gone UNION ALL SELECT key, expires_at FROM gone_sets) AS d
      WHERE expires_at IS NULL OR expires_at > now()`;
    return Number(rows[0]?.removed ?? 0);
  }

  async increment(key: string, ttlSeconds: number): Promise<CounterResult> {
    // INCR, plus PEXPIRE when the counter starts (or restarts after expiring).
    const rows = await this.db.$queryRaw<Array<{ value: bigint; ttl_ms: bigint }>>`
      INSERT INTO kv_entries AS e (key, value, expires_at)
      VALUES (${this.k(key)}, '1', now() + ${ttlSeconds * 1000}::float8 * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        value = CASE WHEN e.expires_at <= now() THEN '1' ELSE (e.value::bigint + 1)::text END,
        expires_at = CASE WHEN e.expires_at <= now() THEN EXCLUDED.expires_at ELSE e.expires_at END
      RETURNING
        e.value::bigint AS value,
        CASE WHEN e.expires_at IS NULL THEN -1
             ELSE floor(extract(epoch FROM e.expires_at - now()) * 1000)::bigint END AS ttl_ms`;
    const row = rows[0];
    if (!row) throw new Error(`Key/value increment of "${key}" returned no row`);
    return { value: Number(row.value), ttlMs: Number(row.ttl_ms) };
  }

  async ttl(key: string): Promise<number> {
    const fullKey = this.k(key);
    const rows = await this.db.$queryRaw<TtlRow[]>`
      SELECT CASE WHEN expires_at IS NULL THEN -1
                  ELSE floor(extract(epoch FROM expires_at - now()) * 1000)::bigint END AS ttl_ms
      FROM (
        SELECT expires_at FROM kv_entries
        WHERE key = ${fullKey} AND (expires_at IS NULL OR expires_at > now())
        UNION ALL
        SELECT expires_at FROM kv_set_members
        WHERE key = ${fullKey} AND (expires_at IS NULL OR expires_at > now())
      ) AS live
      LIMIT 1`;
    const row = rows[0];
    return row ? Number(row.ttl_ms) : -2;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const ttlMs = PostgresKeyValueStore.ttlMs(ttlSeconds);
    // EXPIRE with a TTL of zero or less deletes the key.
    if (ttlMs === null) {
      await this.delete(key);
      return;
    }
    const fullKey = this.k(key);
    await this.db.$executeRaw`
      WITH entries AS (
        UPDATE kv_entries SET expires_at = now() + ${ttlMs}::float8 * interval '1 millisecond'
        WHERE key = ${fullKey} AND (expires_at IS NULL OR expires_at > now())
      )
      UPDATE kv_set_members SET expires_at = now() + ${ttlMs}::float8 * interval '1 millisecond'
      WHERE key = ${fullKey} AND (expires_at IS NULL OR expires_at > now())`;
  }

  async setAdd(key: string, member: string, ttlSeconds?: number): Promise<void> {
    const fullKey = this.k(key);
    const ttlMs = PostgresKeyValueStore.ttlMs(ttlSeconds);
    await this.db.$transaction([
      // An expired set no longer exists: the member starts a new one.
      this.db.$executeRaw`
        DELETE FROM kv_set_members WHERE key = ${fullKey} AND expires_at <= now()`,
      // A new member takes the set's current expiry, as SADD keeps the TTL...
      this.db.$executeRaw`
        INSERT INTO kv_set_members (key, member, expires_at)
        VALUES (${fullKey}, ${member},
                (SELECT expires_at FROM kv_set_members WHERE key = ${fullKey} LIMIT 1))
        ON CONFLICT (key, member) DO NOTHING`,
      // ...and a TTL, when given, restarts it for the whole set (EXPIRE).
      ...(ttlMs === null
        ? []
        : [
            this.db.$executeRaw`
              UPDATE kv_set_members
              SET expires_at = now() + ${ttlMs}::float8 * interval '1 millisecond'
              WHERE key = ${fullKey}`,
          ]),
    ]);
  }

  async setRemove(key: string, member: string): Promise<void> {
    await this.db.$executeRaw`
      DELETE FROM kv_set_members WHERE key = ${this.k(key)} AND member = ${member}`;
  }

  async setMembers(key: string): Promise<string[]> {
    const rows = await this.db.$queryRaw<Array<{ member: string }>>`
      SELECT member FROM kv_set_members
      WHERE key = ${this.k(key)} AND (expires_at IS NULL OR expires_at > now())`;
    return rows.map((row) => row.member);
  }

  /** Up when the database answers and the key/value tables exist (migrated). */
  async ping(): Promise<boolean> {
    try {
      await this.db.$queryRaw`SELECT 1 FROM kv_entries LIMIT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** Stops the sweep. The database connection belongs to PrismaService. */
  close(): Promise<void> {
    clearInterval(this.sweeper);
    return Promise.resolve();
  }

  /** Deletes rows past their expiry; reads already ignore them. */
  async sweep(): Promise<void> {
    try {
      await this.db.$executeRaw`
        WITH sets AS (DELETE FROM kv_set_members WHERE expires_at <= now())
        DELETE FROM kv_entries WHERE expires_at <= now()`;
    } catch (error) {
      this.logger.warn(
        `Could not delete expired key/value rows: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
