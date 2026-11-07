import { describe, expect, it, vi } from 'vitest';
import type { AuditLogger } from '#core/application/ports/audit-logger.port.js';
import { chainHash, GENESIS_HASH, type ChainRow } from './audit-chain.js';
import { AuditIntegrityService } from './audit-integrity.service.js';
import type { AuditCheckpoint, AuditRecordRepository } from './audit-record.repository.js';

const key = Buffer.alloc(32, 3);

function chain(count: number, from = 1, prev = GENESIS_HASH): ChainRow[] {
  const rows: ChainRow[] = [];
  for (let i = from; i < from + count; i++) {
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
      ipAddress: null,
      userAgent: null,
      correlationId: null,
      metadata: null,
    };
    const hash = chainHash(key, prev, base);
    rows.push({ ...base, prevHash: prev, hash });
    prev = hash;
  }
  return rows;
}

const checkpoint = (overrides: Partial<AuditCheckpoint>): AuditCheckpoint => ({
  id: 'cp-1',
  createdAt: new Date(),
  kind: 'ANCHOR',
  seq: 1n,
  hash: 'x',
  fromSeq: null,
  recordCount: 0,
  archiveRef: null,
  createdBy: null,
  ...overrides,
});

function service(
  rows: ChainRow[],
  {
    purge = null,
    anchors = [],
    created = null,
  }: {
    purge?: AuditCheckpoint | null;
    anchors?: AuditCheckpoint[];
    created?: AuditCheckpoint | null;
  } = {},
) {
  const repo = {
    latestCheckpoint: vi.fn(() => Promise.resolve(purge)),
    // Small pages so the walk spans several batches.
    readChain: vi.fn((after: bigint | null) =>
      Promise.resolve(rows.filter((r) => after === null || r.seq > after).slice(0, 1_000)),
    ),
    listCheckpoints: vi.fn(() => Promise.resolve(anchors)),
    findBySeq: vi.fn((seq: bigint) => Promise.resolve(rows.find((r) => r.seq === seq) ?? null)),
    head: vi.fn(() =>
      Promise.resolve(rows.length ? { seq: rows.at(-1)!.seq, hash: rows.at(-1)!.hash! } : null),
    ),
    createAnchor: vi.fn(() => Promise.resolve(created)),
  } as unknown as AuditRecordRepository;
  const audit = { record: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditLogger;
  return { svc: new AuditIntegrityService(repo, key, audit), repo, audit };
}

describe('AuditIntegrityService.verify', () => {
  it('reports an empty trail', async () => {
    const { svc, audit } = service([]);
    const report = await svc.verify(null);
    expect(report).toMatchObject({
      status: 'EMPTY',
      checked: 0,
      firstSeq: null,
      lastSeq: null,
      headHash: null,
      break: null,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUDIT_INTEGRITY_VERIFY',
        outcome: 'SUCCESS',
        actorUsername: 'system',
      }),
    );
  });

  it('verifies an intact chain and its anchors, across batches', async () => {
    const rows = chain(1_200);
    const { svc, audit } = service(rows, {
      anchors: [checkpoint({ seq: 1_100n, hash: rows[1_099]!.hash! })],
    });
    const report = await svc.verify({ id: 'u1', username: 'auditor' });
    expect(report).toMatchObject({
      status: 'INTACT',
      checked: 1_200,
      firstSeq: '1',
      lastSeq: '1200',
      anchorsChecked: 1,
      startsAfterPurge: null,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', actorUsername: 'auditor' }),
    );
  });

  it('finds an altered record and stops there', async () => {
    const rows = chain(5);
    rows[2] = { ...rows[2]!, action: 'ROLE_DELETE' };
    const { svc, audit } = service(rows);
    const report = await svc.verify(null);
    expect(report.status).toBe('BROKEN');
    expect(report.checked).toBe(2);
    expect(report.break).toMatchObject({ seq: '3', reason: 'HASH_MISMATCH' });
    expect(report.anchorsChecked).toBe(0);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'FAILURE', errorCode: 'AUDIT_HASH_MISMATCH' }),
    );
  });

  it('detects deleted newest records through an anchor', async () => {
    const rows = chain(5);
    const { svc } = service(rows.slice(0, 3), {
      anchors: [checkpoint({ seq: 5n, hash: rows[4]!.hash! })],
    });
    const report = await svc.verify(null);
    expect(report.break).toEqual({ seq: '5', id: null, reason: 'ANCHOR_MISMATCH' });
  });

  it('detects an anchor whose record no longer matches', async () => {
    const rows = chain(3);
    const { svc } = service(rows, { anchors: [checkpoint({ seq: 2n, hash: 'f'.repeat(64) })] });
    expect((await svc.verify(null)).break).toEqual({
      seq: '2',
      id: 'id-2',
      reason: 'ANCHOR_MISMATCH',
    });
  });

  it('starts after the last purge and skips anchors it removed', async () => {
    const purged = chain(4);
    const kept = chain(3, 5, purged[3]!.hash!);
    const purge = checkpoint({
      kind: 'PURGE',
      seq: 4n,
      hash: purged[3]!.hash!,
      archiveRef: 's3://archive/1',
    });
    const { svc } = service(kept, {
      purge,
      anchors: [
        checkpoint({ seq: 2n, hash: 'gone' }),
        checkpoint({ seq: 6n, hash: kept[1]!.hash! }),
      ],
    });
    const report = await svc.verify(null);
    expect(report).toMatchObject({
      status: 'INTACT',
      checked: 3,
      firstSeq: '5',
      startsAfterPurge: { seq: '4', archiveRef: 's3://archive/1' },
      anchorsChecked: 1,
    });
  });
});

describe('AuditIntegrityService.anchor', () => {
  it('records the chain head and audits it', async () => {
    const created = checkpoint({ id: 'cp-9', seq: 42n });
    const { svc, repo, audit } = service([], { created });
    expect(await svc.anchor({ id: 'u1', username: 'auditor' })).toBe(created);
    expect(repo.createAnchor).toHaveBeenCalledWith('u1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUDIT_ANCHOR_CREATE',
        resourceId: 'cp-9',
        metadata: { seq: '42' },
      }),
    );
  });

  it('does nothing on an empty trail', async () => {
    const { svc, repo, audit } = service([]);
    expect(await svc.anchor(null)).toBeNull();
    expect(repo.createAnchor).toHaveBeenCalledWith('system');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
