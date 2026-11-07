import type { AuditRecord } from '#core/domain/audit-record.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import type { ChainRow } from './audit-chain.js';

export interface AuditRecordView extends AuditRecord {
  id: string;
  seq: bigint;
  prevHash: string | null;
  hash: string | null;
}

export interface AuditActivitySummary {
  total: number;
  failures: number;
  denied: number;
  distinctActors: number;
  byCategory: Array<{ category: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
}

/** Whose activity: records they performed, records about them, failed sign-ins with their name. */
export interface AuditSubject {
  userId: string;
  username: string;
}

export interface PersonalActivitySummary {
  signIns: number;
  failedSignIns: number;
  changes: number;
  devices: number;
  lastFailedSignInAt: Date | null;
}

export interface AuditFacets {
  actions: Array<{ action: string; count: number }>;
  resourceTypes: string[];
}

export type AuditCheckpointKind = 'ANCHOR' | 'PURGE';

export interface AuditCheckpoint {
  id: string;
  createdAt: Date;
  kind: AuditCheckpointKind;
  seq: bigint;
  hash: string;
  fromSeq: bigint | null;
  recordCount: number;
  archiveRef: string | null;
  createdBy: string | null;
}

export interface AuditChainStats {
  total: number;
  unsealed: number;
  firstSeq: bigint | null;
  lastSeq: bigint | null;
  oldest: Date | null;
  newest: Date | null;
}

/**
 * Append-only persistence for audit records. `append` seals each record into
 * the hash chain atomically (serialised by a database advisory lock).
 */
export interface AuditRecordRepository {
  append(record: AuditRecord): Promise<void>;
  findPage(request: PageRequest): Promise<Page<AuditRecordView>>;
  findById(id: string): Promise<AuditRecordView | null>;
  /** Activity figures for a time window (either end open). */
  summary(from: Date | null, to: Date | null): Promise<AuditActivitySummary>;
  /** Distinct actions (with counts) and resource types, for filter pickers. */
  facets(): Promise<AuditFacets>;
  /** A person's own activity, newest first (keyset pagination on the chain position). */
  findForSubject(
    subject: AuditSubject,
    options: { beforeSeq: bigint | null; limit: number; excludeActions: readonly string[] },
  ): Promise<AuditRecordView[]>;
  summarizeForSubject(subject: AuditSubject, since: Date): Promise<PersonalActivitySummary>;

  // ── Chain maintenance & verification ─────────────────────────────────────
  /** Seals rows written before the chain existed (hash IS NULL), in chain order. */
  sealPending(): Promise<number>;
  /** Rows in chain order after `afterSeq` (exclusive). */
  readChain(afterSeq: bigint | null, limit: number): Promise<ChainRow[]>;
  findBySeq(seq: bigint): Promise<ChainRow | null>;
  head(): Promise<{ seq: bigint; hash: string } | null>;
  stats(): Promise<AuditChainStats>;

  // ── Checkpoints ──────────────────────────────────────────────────────────
  createAnchor(createdBy: string | null): Promise<AuditCheckpoint | null>;
  latestCheckpoint(kind: AuditCheckpointKind): Promise<AuditCheckpoint | null>;
  listCheckpoints(kind: AuditCheckpointKind | null, limit: number): Promise<AuditCheckpoint[]>;

  // ── Retention ────────────────────────────────────────────────────────────
  countOlderThan(cutoff: Date): Promise<number>;
  /** Oldest rows in chain order (retention always removes a contiguous prefix). */
  oldest(limit: number): Promise<ChainRow[]>;
  /**
   * Deletes every row up to `last.seq` and records a PURGE checkpoint in the
   * same transaction, so verification continues from `last.hash`.
   */
  purgeThrough(
    first: ChainRow,
    last: ChainRow,
    count: number,
    archiveRef: string | null,
    createdBy: string | null,
  ): Promise<void>;
}

export const AUDIT_RECORD_REPOSITORY = Symbol('AuditRecordRepository');

/** Secret for the audit HMAC chain (bound from configuration). */
export const AUDIT_CHAIN_KEY = Symbol('AuditChainKey');
