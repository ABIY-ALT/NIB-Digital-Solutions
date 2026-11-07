/**
 * Recurring background jobs (retention, approval expiry, audit anchoring, ...).
 *
 *   scheduler.register({ name: 'retention', everyMs: 24 * 3_600_000, run: () => retention.run() });
 *
 * Implementations guarantee that a job runs on ONE instance at a time (a
 * distributed lock in the key/value store) and that failures are logged, never
 * thrown into the process.
 */
export interface ScheduledJob {
  /** Unique, stable name (also the lock key). */
  name: string;
  everyMs: number;
  /** Delay before the first run (default: one minute, to let the app warm up). */
  initialDelayMs?: number;
  run: () => Promise<unknown>;
}

export interface JobRunInfo {
  name: string;
  everyMs: number;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastStatus: 'success' | 'failed' | 'skipped' | null;
  lastError: string | null;
  nextRunAt: Date | null;
}

export interface JobScheduler {
  register(job: ScheduledJob): void;
  /** Runs a job now (still honours the single-instance lock). */
  trigger(name: string): Promise<'ran' | 'skipped'>;
  list(): JobRunInfo[];
}

export const JOB_SCHEDULER = Symbol('JobScheduler');
