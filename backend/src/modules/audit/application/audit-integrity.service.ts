import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '#core/application/ports/audit-logger.port.js';
import { hashesEqual, GENESIS_HASH, verifySegment, type ChainBreak } from './audit-chain.js';
import {
  AUDIT_CHAIN_KEY,
  AUDIT_RECORD_REPOSITORY,
  type AuditCheckpoint,
  type AuditRecordRepository,
} from './audit-record.repository.js';

export interface IntegrityReport {
  status: 'INTACT' | 'BROKEN' | 'EMPTY';
  verifiedAt: Date;
  durationMs: number;
  /** Records whose hash and link were recomputed. */
  checked: number;
  firstSeq: string | null;
  lastSeq: string | null;
  headHash: string | null;
  /** The chain starts from this purge checkpoint (older records were retained elsewhere). */
  startsAfterPurge: { seq: string; archiveRef: string | null } | null;
  anchorsChecked: number;
  break: ChainBreak | null;
}

const BATCH = 1_000;

/**
 * Proves the audit trail has not been altered:
 *   1. walks the chain in order, recomputing every HMAC and link;
 *   2. checks recent ANCHOR checkpoints still match (detects deletion of the
 *      newest records, which a chain walk alone cannot see).
 * Each verification is itself audited.
 */
@Injectable()
export class AuditIntegrityService {
  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly repo: AuditRecordRepository,
    @Inject(AUDIT_CHAIN_KEY) private readonly key: Buffer,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async verify(actor: { id: string; username: string } | null): Promise<IntegrityReport> {
    const started = Date.now();
    const purge = await this.repo.latestCheckpoint('PURGE');
    const chain = await this.walkChain(purge?.hash ?? GENESIS_HASH);
    const anchors = chain.brokenAt
      ? { checked: 0, brokenAt: null }
      : await this.checkAnchors(purge);
    const brokenAt = chain.brokenAt ?? anchors.brokenAt;
    const { checked } = chain;

    const head = await this.repo.head();
    const report: IntegrityReport = {
      status: integrityStatus(brokenAt, checked),
      verifiedAt: new Date(),
      durationMs: Date.now() - started,
      checked,
      firstSeq: chain.firstSeq?.toString() ?? null,
      lastSeq: head?.seq.toString() ?? null,
      headHash: head?.hash ?? null,
      startsAfterPurge: purge ? { seq: purge.seq.toString(), archiveRef: purge.archiveRef } : null,
      anchorsChecked: anchors.checked,
      break: brokenAt,
    };

    await this.audit.record({
      action: 'AUDIT_INTEGRITY_VERIFY',
      category: 'SECURITY',
      resourceType: 'AuditTrail',
      resourceId: null,
      outcome: brokenAt ? 'FAILURE' : 'SUCCESS',
      errorCode: brokenAt ? `AUDIT_${brokenAt.reason}` : null,
      actorId: actor?.id ?? null,
      actorUsername: actor?.username ?? 'system',
      metadata: { checked, status: report.status, break: brokenAt },
    });
    return report;
  }

  /** Walks the chain in order from `expected` (genesis, or the last purge checkpoint). */
  private async walkChain(
    expected: string,
  ): Promise<{ checked: number; firstSeq: bigint | null; brokenAt: ChainBreak | null }> {
    let tip = expected;
    let cursor: bigint | null = null;
    let checked = 0;
    let firstSeq: bigint | null = null;
    for (;;) {
      const rows = await this.repo.readChain(cursor, BATCH);
      if (rows.length === 0) return { checked, firstSeq, brokenAt: null };
      firstSeq ??= rows[0]!.seq;
      const result = verifySegment(this.key, rows, tip);
      if (!result.ok) {
        checked += rows.findIndex((r) => r.seq.toString() === result.break.seq);
        return { checked, firstSeq, brokenAt: result.break };
      }
      checked += rows.length;
      tip = result.tip;
      cursor = rows.at(-1)!.seq;
    }
  }

  /** Recent anchors must still match their records: detects deletion of the newest records. */
  private async checkAnchors(
    purge: AuditCheckpoint | null,
  ): Promise<{ checked: number; brokenAt: ChainBreak | null }> {
    let checked = 0;
    for (const anchor of await this.repo.listCheckpoints('ANCHOR', 30)) {
      if (purge && anchor.seq <= purge.seq) continue; // legitimately purged since
      checked += 1;
      const row = await this.repo.findBySeq(anchor.seq);
      if (!row?.hash || !hashesEqual(row.hash, anchor.hash)) {
        const brokenAt: ChainBreak = {
          seq: anchor.seq.toString(),
          id: row?.id ?? null,
          reason: 'ANCHOR_MISMATCH',
        };
        return { checked, brokenAt };
      }
    }
    return { checked, brokenAt: null };
  }

  /** Records the current chain head so later truncation is detectable. */
  async anchor(actor: { id: string; username: string } | null): Promise<AuditCheckpoint | null> {
    const checkpoint = await this.repo.createAnchor(actor?.id ?? 'system');
    if (checkpoint) {
      await this.audit.record({
        action: 'AUDIT_ANCHOR_CREATE',
        category: 'SECURITY',
        resourceType: 'AuditCheckpoint',
        resourceId: checkpoint.id,
        outcome: 'SUCCESS',
        errorCode: null,
        actorId: actor?.id ?? null,
        actorUsername: actor?.username ?? 'system',
        metadata: { seq: checkpoint.seq.toString() },
      });
    }
    return checkpoint;
  }
}

function integrityStatus(brokenAt: ChainBreak | null, checked: number): IntegrityReport['status'] {
  if (brokenAt) return 'BROKEN';
  return checked === 0 ? 'EMPTY' : 'INTACT';
}
