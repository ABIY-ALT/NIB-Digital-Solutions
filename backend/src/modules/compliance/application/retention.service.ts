import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '#core/application/ports/audit-logger.port.js';
import {
  ARCHIVE_STORAGE,
  RETENTION_REGISTRY,
  type ArchiveStorage,
  type RetentionPolicy,
  type RetentionRegistry,
} from '#core/application/ports/retention.port.js';
import type { Page } from '#core/domain/pagination.js';

export interface RetentionPolicyResult {
  policy: string;
  dataset: string;
  retentionDays: number;
  cutoff: string;
  matched: number;
  purged: number;
  archived: number;
  archiveRef: string | null;
  notes: string | null;
  error: string | null;
}

export interface RetentionRunRecord {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  trigger: 'SCHEDULED' | 'MANUAL';
  dryRun: boolean;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  triggeredBy: string | null;
  results: RetentionPolicyResult[];
  error: string | null;
}

export interface RetentionRunRepository {
  start(run: Omit<RetentionRunRecord, 'id' | 'finishedAt' | 'results' | 'error'>): Promise<string>;
  finish(
    id: string,
    status: 'SUCCEEDED' | 'FAILED',
    results: RetentionPolicyResult[],
    error: string | null,
  ): Promise<void>;
  findPage(page: number, pageSize: number): Promise<Page<RetentionRunRecord>>;
}

export const RETENTION_RUNS = Symbol('RetentionRunRepository');

export const RETENTION_SETTINGS = Symbol('RetentionSettings');
export interface RetentionSettings {
  batchSize: number;
}

/**
 * Runs every registered retention policy: counts what is past its retention
 * period, archives it when the policy says so, deletes it, and records the run
 * (and an audit entry) as evidence. Policies fail independently.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger('Retention');

  constructor(
    @Inject(RETENTION_REGISTRY) private readonly registry: RetentionRegistry,
    @Inject(ARCHIVE_STORAGE) private readonly archives: ArchiveStorage,
    @Inject(RETENTION_RUNS) private readonly runs: RetentionRunRepository,
    @Inject(RETENTION_SETTINGS) private readonly settings: RetentionSettings,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  policies() {
    return this.registry.list().map((p) => ({
      id: p.id,
      dataset: p.dataset,
      description: p.description,
      retentionDays: p.retentionDays,
      archive: p.archive,
      basis: p.basis ?? null,
    }));
  }

  /** What a run would remove right now (no changes). */
  async preview(now = new Date()) {
    return Promise.all(
      this.registry.list().map(async (p) => {
        const cutoff = cutoffFor(p.retentionDays, now);
        return { policy: p.id, cutoff: cutoff.toISOString(), matched: await p.count(cutoff) };
      }),
    );
  }

  async run(options: {
    trigger: 'SCHEDULED' | 'MANUAL';
    dryRun: boolean;
    actor: { id: string; username: string } | null;
  }): Promise<RetentionRunRecord> {
    const startedAt = new Date();
    const runId = await this.runs.start({
      startedAt,
      trigger: options.trigger,
      dryRun: options.dryRun,
      status: 'RUNNING',
      triggeredBy: options.actor?.id ?? null,
    });

    const results: RetentionPolicyResult[] = [];
    for (const policy of this.registry.list()) {
      results.push(await this.applyPolicy(policy, startedAt, runId, options.dryRun));
    }

    const failed = results.some((r) => r.error);
    await this.runs.finish(runId, failed ? 'FAILED' : 'SUCCEEDED', results, null);
    await this.audit.record({
      action: options.dryRun ? 'RETENTION_PREVIEW' : 'RETENTION_RUN',
      category: 'SYSTEM',
      resourceType: 'RetentionRun',
      resourceId: runId,
      outcome: failed ? 'FAILURE' : 'SUCCESS',
      errorCode: failed ? 'RETENTION_POLICY_FAILED' : null,
      actorId: options.actor?.id ?? null,
      actorUsername: options.actor?.username ?? 'system',
      metadata: {
        trigger: options.trigger,
        purged: results.reduce((n, r) => n + r.purged, 0),
        policies: results.map((r) => `${r.policy}:${r.purged}/${r.matched}`),
      },
    });
    return {
      id: runId,
      startedAt,
      finishedAt: new Date(),
      trigger: options.trigger,
      dryRun: options.dryRun,
      status: failed ? 'FAILED' : 'SUCCEEDED',
      triggeredBy: options.actor?.id ?? null,
      results,
      error: null,
    };
  }

  listRuns(page: number, pageSize: number): Promise<Page<RetentionRunRecord>> {
    return this.runs.findPage(page, pageSize);
  }

  /** Counts, then (unless a dry run) archives and purges. A failure is recorded, not thrown. */
  private async applyPolicy(
    policy: RetentionPolicy,
    now: Date,
    runId: string,
    dryRun: boolean,
  ): Promise<RetentionPolicyResult> {
    const cutoff = cutoffFor(policy.retentionDays, now);
    const result: RetentionPolicyResult = {
      policy: policy.id,
      dataset: policy.dataset,
      retentionDays: policy.retentionDays,
      cutoff: cutoff.toISOString(),
      matched: 0,
      purged: 0,
      archived: 0,
      archiveRef: null,
      notes: null,
      error: null,
    };
    try {
      result.matched = await policy.count(cutoff);
      if (!dryRun && result.matched > 0) {
        const archive = policy.archive ? await this.archives.open(policy.id, runId) : null;
        try {
          const outcome = await policy.purge(cutoff, {
            runId,
            batchSize: this.settings.batchSize,
            archive,
          });
          result.purged = outcome.purged;
          result.archived = outcome.archived;
          result.notes = outcome.notes ?? null;
        } finally {
          if (archive) result.archiveRef = await archive.close();
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: error, policy: policy.id, runId }, 'Retention policy failed');
    }
    return result;
  }
}

function cutoffFor(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
