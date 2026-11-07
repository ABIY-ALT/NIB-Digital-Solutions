import type {
  PurgeContext,
  PurgeResult,
  RetentionPolicy,
} from '#core/application/ports/retention.port.js';
import type { AuditRecordRepository } from './audit-record.repository.js';

/**
 * Audit trail retention. Records older than the retention period are archived
 * (with their hashes, so the archive itself is verifiable) and then removed as
 * a contiguous prefix of the chain; a PURGE checkpoint keeps the remaining
 * chain verifiable.
 */
export class AuditRetentionPolicy implements RetentionPolicy {
  readonly id = 'audit-logs';
  readonly dataset = 'Audit trail';
  readonly description =
    'Security and data-change audit records, archived with their chain hashes before removal.';
  readonly archive = true;
  readonly basis = 'Financial-sector record keeping (default 7 years; AUDIT_RETENTION_DAYS)';

  constructor(
    private readonly repo: AuditRecordRepository,
    readonly retentionDays: number,
  ) {}

  count(cutoff: Date): Promise<number> {
    return this.repo.countOlderThan(cutoff);
  }

  async purge(cutoff: Date, context: PurgeContext): Promise<PurgeResult> {
    let purged = 0;
    let archived = 0;
    let checkpoints = 0;
    for (;;) {
      const rows = await this.repo.oldest(context.batchSize);
      // Only the leading records older than the cutoff (the chain must stay contiguous).
      const expired = [];
      for (const row of rows) {
        if (row.occurredAt >= cutoff || !row.hash) break;
        expired.push(row);
      }
      if (expired.length === 0) break;
      if (context.archive) {
        await context.archive.write(
          expired.map((r) => ({
            ...r,
            seq: r.seq.toString(),
            occurredAt: r.occurredAt.toISOString(),
          })),
        );
        archived += expired.length;
      }
      await this.repo.purgeThrough(
        expired[0]!,
        expired.at(-1)!,
        expired.length,
        context.runId,
        'system:retention',
      );
      purged += expired.length;
      checkpoints += 1;
      if (expired.length < rows.length) break;
    }
    return {
      purged,
      archived,
      notes: checkpoints ? `${checkpoints} purge checkpoint(s) written` : undefined,
    };
  }
}
