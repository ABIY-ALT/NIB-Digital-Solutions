/**
 * Data retention. Each module that owns data declares how long it is kept and
 * how it is removed, and registers the policy at startup:
 *
 *   onModuleInit() { this.retention.register(new NotificationRetentionPolicy(...)); }
 *
 * The compliance module runs every registered policy on a schedule (or on
 * demand, optionally as a dry run), archives what the policy asks for, and
 * records each run.
 */
export interface ArchiveSink {
  /** Appends records (JSON-serialisable) to the archive for this run. */
  write(records: readonly Record<string, unknown>[]): Promise<void>;
}

export interface PurgeContext {
  runId: string;
  batchSize: number;
  /** Present when the policy archives before purging. */
  archive: ArchiveSink | null;
}

export interface PurgeResult {
  purged: number;
  archived: number;
  /** Extra facts to show in the run report (e.g. the audit checkpoint written). */
  notes?: string;
}

export interface RetentionPolicy {
  /** Stable id, e.g. "audit-logs". */
  readonly id: string;
  /** Human-readable dataset name. */
  readonly dataset: string;
  readonly description: string;
  readonly retentionDays: number;
  /** Archive records before they are deleted. */
  readonly archive: boolean;
  /** Why this period (regulation, policy). Shown to auditors. */
  readonly basis?: string;
  /** Records a run would remove (dry run / preview). */
  count(cutoff: Date): Promise<number>;
  purge(cutoff: Date, context: PurgeContext): Promise<PurgeResult>;
}

export interface RetentionRegistry {
  register(policy: RetentionPolicy): void;
  list(): RetentionPolicy[];
}

export const RETENTION_REGISTRY = Symbol('RetentionRegistry');

/** Writes archives (local disk by default; bind object storage in production). */
export interface ArchiveStorage {
  open(dataset: string, runId: string): Promise<ArchiveSink & { close(): Promise<string> }>;
}

export const ARCHIVE_STORAGE = Symbol('ArchiveStorage');
