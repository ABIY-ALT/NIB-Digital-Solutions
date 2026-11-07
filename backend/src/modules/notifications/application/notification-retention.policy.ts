import type {
  PurgeContext,
  PurgeResult,
  RetentionPolicy,
} from '#core/application/ports/retention.port.js';
import type { NotificationRepository } from './notification.ports.js';

const TRASH_DAYS = 30;

/** Inbox hygiene: trash is emptied after 30 days; unstarred messages expire. */
export class NotificationRetentionPolicy implements RetentionPolicy {
  readonly id = 'notifications';
  readonly dataset = 'Notifications';
  readonly description = `In-app messages (starred messages are kept); trash is emptied after ${TRASH_DAYS} days.`;
  readonly archive = false;
  readonly basis = 'Operational data (NOTIFICATION_RETENTION_DAYS)';

  constructor(
    private readonly repo: NotificationRepository,
    readonly retentionDays: number,
  ) {}

  private trashCutoff(): Date {
    return new Date(Date.now() - TRASH_DAYS * 86_400_000);
  }

  count(cutoff: Date): Promise<number> {
    return this.repo.countExpired(cutoff, this.trashCutoff());
  }

  async purge(cutoff: Date, context: PurgeContext): Promise<PurgeResult> {
    const purged = await this.repo.deleteExpired(cutoff, this.trashCutoff(), context.batchSize);
    return { purged, archived: 0 };
  }
}
