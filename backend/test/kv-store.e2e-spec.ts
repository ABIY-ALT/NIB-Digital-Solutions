import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresKeyValueStore } from '#core/infrastructure/kv/postgres-key-value.store.js';
import { PrismaClient } from '#generated/prisma/client.js';
import { describeKeyValueStore } from './support/kv-store-contract.js';

/**
 * The PostgreSQL key/value store (KV_STORE=postgres) against the real database
 * in DATABASE_URL: the same contract as the in-memory store, plus what only a
 * database has (the sweep, an unreachable server).
 */
const connect = (url: string): PrismaClient =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const prisma = connect(process.env.DATABASE_URL ?? '');

afterAll(async () => {
  // Leave no rows behind: the API tests share this database.
  await prisma.$executeRaw`
    WITH sets AS (
      DELETE FROM kv_set_members WHERE starts_with(key, 'e2e:') OR starts_with(key, 'sweep:')
    )
    DELETE FROM kv_entries WHERE starts_with(key, 'e2e:') OR starts_with(key, 'sweep:')`;
  await prisma.$disconnect();
});

describeKeyValueStore('PostgresKeyValueStore', () => new PostgresKeyValueStore(prisma, 'e2e:'));

describe('PostgresKeyValueStore housekeeping', () => {
  it('deletes rows past their expiry in its sweep, and only those', async () => {
    const prefix = `sweep:${randomUUID()}:`;
    const store = new PostgresKeyValueStore(prisma, prefix);
    await store.set('gone', 'x', { ttlSeconds: 1 });
    await store.setAdd('gone-set', 'member', 1);
    await store.set('kept', 'x', { ttlSeconds: 60 });
    await store.setAdd('kept-set', 'member');

    await sleep(1_200);
    await store.sweep();

    const rows = await prisma.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM kv_entries WHERE starts_with(key, ${prefix})
      UNION ALL
      SELECT key FROM kv_set_members WHERE starts_with(key, ${prefix})`;
    expect(rows.map((row) => row.key).sort()).toEqual([`${prefix}kept`, `${prefix}kept-set`]);
    await store.close();
  });

  it('answers a ping with false when the database cannot be reached', async () => {
    const unreachable = connect('postgresql://nobody:nothing@127.0.0.1:1/none');
    const store = new PostgresKeyValueStore(unreachable, 'down:');
    expect(await store.ping()).toBe(false);
    await store.close();
    await unreachable.$disconnect();
  });
});
