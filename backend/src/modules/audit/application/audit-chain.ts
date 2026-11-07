import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuditRecord } from '#core/domain/audit-record.js';
import { compareCodeUnits } from '#core/domain/strings.js';

/**
 * Tamper-evident audit chain.
 *
 *   hash(n) = HMAC-SHA256(key, hash(n-1) + "|" + canonical(record n))
 *
 * Every record commits to its predecessor, so changing, deleting or reordering
 * any record breaks every hash after it; the secret key stops an attacker with
 * database access from recomputing the chain. The first record links to the
 * GENESIS hash, or to the last PURGE checkpoint after retention removed older
 * records.
 */
export const GENESIS_HASH = '0'.repeat(64);

export interface ChainableRecord extends Omit<AuditRecord, 'id'> {
  id: string;
  seq: bigint;
}

export interface ChainRow extends ChainableRecord {
  prevHash: string | null;
  hash: string | null;
}

/** JSON with recursively sorted keys (Postgres jsonb does not keep key order). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    // Keys holding undefined are dropped, as JSON (and so jsonb) drops them:
    // the record is hashed exactly as it will be read back.
    return Object.fromEntries(
      Object.keys(value)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort(compareCodeUnits)
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value ?? null;
}

export function chainHash(key: Buffer, prevHash: string, r: ChainableRecord): string {
  const body = canonicalJson([
    r.seq.toString(),
    r.id,
    r.occurredAt.toISOString(),
    r.actorId,
    r.actorUsername,
    r.action,
    r.category,
    r.resourceType,
    r.resourceId,
    r.outcome,
    r.errorCode,
    r.ipAddress,
    r.userAgent,
    r.correlationId,
    r.metadata,
  ]);
  return createHmac('sha256', key).update(prevHash).update('|').update(body).digest('hex');
}

export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export type ChainBreakReason = 'UNSEALED' | 'CHAIN_BROKEN' | 'HASH_MISMATCH' | 'ANCHOR_MISMATCH';

export interface ChainBreak {
  seq: string;
  id: string | null;
  reason: ChainBreakReason;
}

/**
 * Verifies consecutive rows (chain order) starting from `expectedPrev`.
 * Returns the first break, or the hash the next row must link to.
 */
export function verifySegment(
  key: Buffer,
  rows: readonly ChainRow[],
  expectedPrev: string,
): { ok: true; tip: string } | { ok: false; break: ChainBreak } {
  let prev = expectedPrev;
  for (const row of rows) {
    const at = { seq: row.seq.toString(), id: row.id };
    if (!row.hash || !row.prevHash) return { ok: false, break: { ...at, reason: 'UNSEALED' } };
    if (!hashesEqual(row.prevHash, prev)) {
      return { ok: false, break: { ...at, reason: 'CHAIN_BROKEN' } };
    }
    if (!hashesEqual(chainHash(key, row.prevHash, row), row.hash)) {
      return { ok: false, break: { ...at, reason: 'HASH_MISMATCH' } };
    }
    prev = row.hash;
  }
  return { ok: true, tip: prev };
}
