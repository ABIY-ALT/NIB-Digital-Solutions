import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  chainHash,
  GENESIS_HASH,
  verifySegment,
  type ChainRow,
} from './audit-chain.js';

const key = Buffer.alloc(32, 7);

function chain(count: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= count; i++) {
    const base = {
      id: `id-${i}`,
      seq: BigInt(i),
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      actorId: 'u1',
      actorUsername: 'admin',
      action: 'ROLE_UPDATE',
      category: 'SECURITY' as const,
      resourceType: 'Role',
      resourceId: `r${i}`,
      outcome: 'SUCCESS' as const,
      errorCode: null,
      ipAddress: '10.0.0.1',
      userAgent: null,
      correlationId: `c${i}`,
      metadata: { b: 2, a: [1, { y: 1, x: 2 }] },
    };
    const hash = chainHash(key, prev, base);
    rows.push({ ...base, prevHash: prev, hash });
    prev = hash;
  }
  return rows;
}

describe('audit hash chain', () => {
  it('canonical JSON ignores key order (jsonb reorders keys)', () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(
      canonicalJson({ a: { c: 2, d: 1 }, b: 1 }),
    );
  });

  it('verifies an untouched chain', () => {
    const rows = chain(5);
    expect(verifySegment(key, rows, GENESIS_HASH)).toEqual({ ok: true, tip: rows[4]!.hash });
  });

  it('detects an altered record', () => {
    const rows = chain(5);
    rows[2] = { ...rows[2]!, action: 'ROLE_DELETE' };
    expect(verifySegment(key, rows, GENESIS_HASH)).toMatchObject({
      ok: false,
      break: { seq: '3', reason: 'HASH_MISMATCH' },
    });
  });

  it('detects a deleted record (broken link)', () => {
    const rows = chain(5);
    rows.splice(1, 1);
    expect(verifySegment(key, rows, GENESIS_HASH)).toMatchObject({
      ok: false,
      break: { seq: '3', reason: 'CHAIN_BROKEN' },
    });
  });

  it('hashes metadata as it is stored: keys holding undefined are left out', () => {
    // A failed sign-in records { result: undefined }; jsonb stores {}.
    expect(canonicalJson({ result: undefined, a: [undefined, 1] })).toBe('{"a":[null,1]}');
    const [row] = chain(1);
    const written = { ...row!, metadata: { result: undefined } };
    const hash = chainHash(key, GENESIS_HASH, written);
    const readBack = {
      ...written,
      metadata: JSON.parse(JSON.stringify(written.metadata)) as Record<string, unknown>,
      hash,
    };
    expect(verifySegment(key, [readBack], GENESIS_HASH)).toEqual({ ok: true, tip: hash });
  });

  it('cannot be recomputed without the key', () => {
    const rows = chain(3);
    const forged = chainHash(Buffer.alloc(32, 9), GENESIS_HASH, { ...rows[0]!, action: 'X' });
    rows[0] = { ...rows[0]!, action: 'X', hash: forged };
    expect(verifySegment(key, rows, GENESIS_HASH)).toMatchObject({ ok: false });
  });
});
