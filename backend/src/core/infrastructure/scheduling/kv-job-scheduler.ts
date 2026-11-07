import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type {
  JobRunInfo,
  JobScheduler,
  ScheduledJob,
} from '#core/application/ports/job-scheduler.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { RequestContext } from '../context/request-context.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '../kv/key-value-store.js';

interface Registered {
  job: ScheduledJob;
  info: JobRunInfo;
  timer: NodeJS.Timeout | null;
}

/**
 * Interval scheduler with a distributed lock (SET NX + TTL in the key/value
 * store), so with N instances each run happens once. Every run gets its own
 * correlation id, which appears in logs and in the audit records it writes.
 * Disabled with JOBS_ENABLED=false (tests, one-off CLI processes).
 */
@Injectable()
export class KeyValueJobScheduler implements JobScheduler, OnApplicationShutdown {
  private readonly logger = new Logger('Scheduler');
  private readonly jobs = new Map<string, Registered>();
  private readonly instanceId = randomUUID();

  constructor(
    @Inject(KEY_VALUE_STORE) private readonly kv: KeyValueStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  register(job: ScheduledJob): void {
    if (this.jobs.has(job.name)) throw new Error(`Job "${job.name}" is already registered`);
    const entry: Registered = {
      job,
      timer: null,
      info: {
        name: job.name,
        everyMs: job.everyMs,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastStatus: null,
        lastError: null,
        nextRunAt: null,
      },
    };
    this.jobs.set(job.name, entry);
    if (!this.config.jobs.enabled) return;
    this.schedule(entry, job.initialDelayMs ?? 60_000);
  }

  async trigger(name: string): Promise<'ran' | 'skipped'> {
    const entry = this.jobs.get(name);
    if (!entry) throw new Error(`Unknown job "${name}"`);
    return this.execute(entry);
  }

  list(): JobRunInfo[] {
    return [...this.jobs.values()].map((j) => ({ ...j.info }));
  }

  onApplicationShutdown(): void {
    for (const entry of this.jobs.values()) if (entry.timer) clearTimeout(entry.timer);
  }

  private schedule(entry: Registered, delayMs: number): void {
    entry.info.nextRunAt = new Date(Date.now() + delayMs);
    entry.timer = setTimeout(() => {
      void this.runScheduled(entry).finally(() => this.schedule(entry, entry.job.everyMs));
    }, delayMs);
    entry.timer.unref();
  }

  /** One run per interval across all instances: the slot key is never released, it expires. */
  private async runScheduled(entry: Registered): Promise<void> {
    const slotTtl = Math.max(30, Math.floor(entry.job.everyMs / 1000) - 5);
    const slot = await this.kv.set(`job-slot:${entry.job.name}`, this.instanceId, {
      ttlSeconds: slotTtl,
      onlyIfAbsent: true,
    });
    if (!slot) {
      entry.info.lastStatus = 'skipped';
      return;
    }
    await this.execute(entry);
  }

  private async execute(entry: Registered): Promise<'ran' | 'skipped'> {
    const { job, info } = entry;
    // Never two concurrent runs (scheduled vs. manual, or across instances).
    const lockKey = `job-running:${job.name}`;
    const acquired = await this.kv.set(lockKey, this.instanceId, {
      ttlSeconds: 15 * 60,
      onlyIfAbsent: true,
    });
    if (!acquired) {
      info.lastStatus = 'skipped';
      return 'skipped';
    }
    const correlationId = `job-${job.name}-${randomUUID()}`;
    info.lastStartedAt = new Date();
    try {
      await RequestContext.run(
        { correlationId, ipAddress: null, userAgent: 'appcore-scheduler', startedAt: Date.now() },
        () => job.run(),
      );
      info.lastStatus = 'success';
      info.lastError = null;
    } catch (error) {
      info.lastStatus = 'failed';
      info.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: error, job: job.name, correlationId }, 'Scheduled job failed');
    } finally {
      info.lastFinishedAt = new Date();
      if ((await this.kv.get(lockKey)) === this.instanceId) await this.kv.delete(lockKey);
    }
    return 'ran';
  }
}
