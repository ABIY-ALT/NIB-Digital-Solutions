import { Inject, Injectable, Logger } from '@nestjs/common';
import { takeChanges } from '#core/application/audit-changes.js';
import type { AuditEntry, AuditLogger } from '#core/application/ports/audit-logger.port.js';
import {
  REQUEST_CONTEXT,
  type RequestContextAccessor,
} from '#core/application/ports/request-context.port.js';
import type { AuditCategory } from '#core/domain/audit-record.js';
import { AUDIT_RECORD_REPOSITORY, type AuditRecordRepository } from './audit-record.repository.js';

/** Categories whose records carry the field-level changes of their request. */
const CHANGE_CATEGORIES: ReadonlySet<AuditCategory> = new Set([
  'DATA_CHANGE',
  'SECURITY',
  'FINANCIAL',
]);

/**
 * Central AuditLogger. Enriches entries with the correlation id, client IP and
 * user agent from the request context and persists them asynchronously.
 * Failures are logged, never propagated: auditing must not break business flows.
 *
 * Field-level changes collected by the repositories during the request (previous
 * and new values) are attached to the request's change record as
 * `metadata.changes`, and so are sealed into the hash chain with it. A failed
 * change discards them: nothing was written.
 */
@Injectable()
export class AuditService implements AuditLogger {
  private readonly logger = new Logger('Audit');

  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly repository: AuditRecordRepository,
    @Inject(REQUEST_CONTEXT) private readonly context: RequestContextAccessor,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const ctx = this.context.current();
    let metadata = entry.metadata;
    if (CHANGE_CATEGORIES.has(entry.category)) {
      const changes = takeChanges(ctx);
      if (changes.length && entry.outcome === 'SUCCESS' && !metadata?.['changes']) {
        metadata = { ...metadata, changes };
      }
    }
    const record = {
      ...entry,
      metadata,
      occurredAt: new Date(),
      ipAddress: entry.ipAddress ?? ctx?.ipAddress ?? null,
      userAgent: entry.userAgent ?? ctx?.userAgent ?? null,
      correlationId: entry.correlationId ?? ctx?.correlationId ?? null,
    };
    try {
      await this.repository.append(record);
    } catch (error) {
      this.logger.error(
        { err: error, action: record.action, correlationId: record.correlationId },
        'Failed to persist audit record',
      );
    }
  }
}
