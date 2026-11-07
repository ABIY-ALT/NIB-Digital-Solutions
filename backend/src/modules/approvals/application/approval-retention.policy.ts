import type {
  PurgeContext,
  PurgeResult,
  RetentionPolicy,
} from '#core/application/ports/retention.port.js';
import type { ApprovalRepository } from './approval.repository.js';

/** Decided maker–checker requests are archived, then removed. Pending ones are never touched. */
export class ApprovalRetentionPolicy implements RetentionPolicy {
  readonly id = 'approval-requests';
  readonly dataset = 'Approval requests';
  readonly description = 'Decided maker–checker requests with their before/after snapshots.';
  readonly archive = true;
  readonly basis = 'Evidence of dual control (APPROVAL_RETENTION_DAYS)';

  constructor(
    private readonly repo: ApprovalRepository,
    readonly retentionDays: number,
  ) {}

  count(cutoff: Date): Promise<number> {
    return this.repo.countDecidedBefore(cutoff);
  }

  async purge(cutoff: Date, context: PurgeContext): Promise<PurgeResult> {
    let purged = 0;
    let archived = 0;
    for (;;) {
      const batch = await this.repo.takeDecidedBefore(cutoff, context.batchSize);
      if (batch.length === 0) break;
      if (context.archive) {
        await context.archive.write(batch.map((r) => ({ ...r.toSnapshot() })));
        archived += batch.length;
      }
      purged += await this.repo.deleteByIds(batch.map((r) => r.id));
      if (batch.length < context.batchSize) break;
    }
    return { purged, archived };
  }
}
