import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import { AuditIntegrityService } from '#modules/audit/application/audit-integrity.service.js';
import {
  AUDIT_RECORD_REPOSITORY,
  type AuditCheckpoint,
  type AuditRecordRepository,
} from '#modules/audit/application/audit-record.repository.js';
import { RetentionService } from '#modules/compliance/application/retention.service.js';
import type { CliCommand } from '../kernel/command.js';
import { ExitCode, UsageError } from '../kernel/errors.js';

const checkpointView = (c: AuditCheckpoint) => ({
  id: c.id,
  kind: c.kind,
  createdAt: c.createdAt,
  seq: c.seq.toString(),
  hash: c.hash,
  recordCount: c.recordCount,
  archiveRef: c.archiveRef,
  createdBy: c.createdBy,
});

const auditStatus: CliCommand = {
  name: 'audit:status',
  summary: 'Size and head of the audit chain, and its latest checkpoints',
  examples: ['audit:status', 'audit:status --json'],
  async run({ get, config, out }) {
    const repo = get<AuditRecordRepository>(AUDIT_RECORD_REPOSITORY);
    const [stats, head, checkpoints] = await Promise.all([
      repo.stats(),
      repo.head(),
      repo.listCheckpoints(null, 5),
    ]);
    const status = {
      records: stats.total,
      unsealed: stats.unsealed,
      firstSeq: stats.firstSeq?.toString() ?? null,
      lastSeq: stats.lastSeq?.toString() ?? null,
      oldest: stats.oldest,
      newest: stats.newest,
      headHash: head?.hash ?? null,
      dedicatedKey: !config.audit.chainKeyDerived,
      retentionDays: config.retention.auditDays,
      checkpoints: checkpoints.map(checkpointView),
    };
    out.emit(status, () => {
      out.keyValues([
        ['Records', status.records],
        ['Unsealed', status.unsealed],
        ['Chain positions', `${status.firstSeq ?? '—'} … ${status.lastSeq ?? '—'}`],
        ['Oldest record', status.oldest],
        ['Newest record', status.newest],
        ['Head hash', status.headHash],
        ['Dedicated chain key', status.dedicatedKey],
        ['Retention', `${status.retentionDays} days`],
      ]);
      out.heading('Latest checkpoints');
      out.table(
        [
          { header: 'KIND', value: (c) => c.kind },
          { header: 'CREATED', value: (c) => c.createdAt },
          { header: 'POSITION', value: (c) => c.seq, align: 'right' },
          { header: 'RECORDS', value: (c) => c.recordCount, align: 'right' },
          { header: 'BY', value: (c) => c.createdBy },
        ],
        status.checkpoints,
      );
      if (!status.dedicatedKey) {
        out.warn('AUDIT_CHAIN_KEY is not set: the chain uses a derived key (development only).');
      }
      if (status.unsealed > 0) {
        out.warn(`${status.unsealed} record(s) are not sealed yet; they are sealed at start-up.`);
      }
    });
    return ExitCode.OK;
  },
};

const auditVerify: CliCommand = {
  name: 'audit:verify',
  summary: 'Prove the audit trail was not altered (recomputes the whole hash chain)',
  description: [
    'Walks the chain in order, recomputing every HMAC and link, then checks that the',
    'recorded anchors still match. Exit code 2 when the chain is broken — schedule it',
    '(cron, pipeline) and alert on a non-zero exit. The verification is itself audited.',
  ].join('\n'),
  examples: ['audit:verify', 'audit:verify --json'],
  async run({ get, actor, out }) {
    const report = await get<AuditIntegrityService>(AuditIntegrityService).verify(actor);
    out.emit(report, () => {
      out.keyValues([
        ['Status', report.status],
        ['Records checked', report.checked],
        ['Chain positions', `${report.firstSeq ?? '—'} … ${report.lastSeq ?? '—'}`],
        ['Anchors checked', report.anchorsChecked],
        ['Head hash', report.headHash],
        ['Duration', `${report.durationMs} ms`],
        ...(report.startsAfterPurge
          ? ([
              [
                'Starts after purge',
                `position ${report.startsAfterPurge.seq} (archive: ${report.startsAfterPurge.archiveRef ?? 'none'})`,
              ],
            ] as const)
          : []),
      ]);
      out.line();
      if (report.break) {
        const record = report.break.id ? `, record ${report.break.id}` : '';
        out.error(
          `The audit trail is BROKEN at position ${report.break.seq} (${report.break.reason}` +
            `${record}). Treat this as a security incident.`,
        );
      } else if (report.status === 'EMPTY') out.info('The audit trail is empty.');
      else out.success('The audit trail is intact.');
    });
    return report.status === 'BROKEN' ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};

const auditAnchor: CliCommand = {
  name: 'audit:anchor',
  summary: 'Record the current chain head as an anchor (before a key change or archive)',
  mutates: true,
  audit: { action: 'CLI_AUDIT_ANCHOR', category: 'SYSTEM', resourceType: 'AuditCheckpoint' },
  examples: ['audit:anchor --reason "CHG-1120 before chain key rotation"'],
  async run({ get, actor, out, auditTarget }) {
    const checkpoint = await get<AuditIntegrityService>(AuditIntegrityService).anchor(actor);
    auditTarget(checkpoint?.id ?? null);
    out.emit({ anchor: checkpoint ? checkpointView(checkpoint) : null }, () => {
      if (checkpoint) {
        out.success(`Anchor recorded at position ${checkpoint.seq} (${checkpoint.hash}).`);
      } else out.info('Nothing to anchor: the trail is empty or the head is already anchored.');
    });
    return ExitCode.OK;
  },
};

const retentionPreview: CliCommand = {
  name: 'retention:preview',
  summary: 'What each retention policy would remove now (changes nothing)',
  examples: ['retention:preview'],
  async run({ get, out }) {
    const retention = get<RetentionService>(RetentionService);
    const matched = new Map((await retention.preview()).map((p) => [p.policy, p]));
    const policies = retention.policies().map((policy) => ({
      ...policy,
      cutoff: matched.get(policy.id)?.cutoff ?? null,
      matched: matched.get(policy.id)?.matched ?? 0,
    }));
    out.emit({ policies }, () => {
      out.table(
        [
          { header: 'POLICY', value: (p) => p.id },
          { header: 'DATASET', value: (p) => p.dataset },
          { header: 'KEEP', value: (p) => `${p.retentionDays} days`, align: 'right' },
          { header: 'ARCHIVE', value: (p) => p.archive },
          { header: 'CUT-OFF', value: (p) => p.cutoff?.slice(0, 10) },
          { header: 'PAST RETENTION', value: (p) => p.matched, align: 'right' },
        ],
        policies,
      );
    });
    return ExitCode.OK;
  },
};

const retentionRun: CliCommand = {
  name: 'retention:run',
  summary: 'Run every retention policy now (archive, then purge)',
  description:
    'The same run as the scheduled job, recorded in the retention history. --dry-run\n' +
    'counts what would be removed without removing it. Exit code 1 when a policy failed.',
  options: [{ name: 'dry-run', type: 'boolean', description: 'Count only; remove nothing' }],
  mutates: (options) => !options.flag('dry-run'),
  destructive: (options) => !options.flag('dry-run'),
  audit: { action: 'CLI_RETENTION_RUN', category: 'SYSTEM', resourceType: 'RetentionRun' },
  examples: ['retention:run --dry-run', 'retention:run --reason "CHG-1130 quarterly purge" --yes'],
  async run({ get, options, actor, out, auditTarget }) {
    const dryRun = options.flag('dry-run');
    const run = await get<RetentionService>(RetentionService).run({
      trigger: 'MANUAL',
      dryRun,
      actor,
    });
    auditTarget(run.id, { dryRun, status: run.status });
    out.emit(run, () => {
      out.table(
        [
          { header: 'POLICY', value: (r) => r.policy },
          { header: 'MATCHED', value: (r) => r.matched, align: 'right' },
          { header: 'ARCHIVED', value: (r) => r.archived, align: 'right' },
          { header: 'PURGED', value: (r) => r.purged, align: 'right' },
          { header: 'ARCHIVE', value: (r) => r.archiveRef, maxWidth: 48 },
          { header: 'ERROR', value: (r) => r.error, maxWidth: 48 },
        ],
        run.results,
      );
      out.line();
      if (run.status === 'SUCCEEDED') {
        out.success(
          dryRun ? 'Dry run finished: nothing was removed.' : `Retention run ${run.id} finished.`,
        );
      } else {
        const detail = run.error ? `: ${run.error}` : '';
        out.error(`Retention run ${run.id} ${run.status}${detail}`);
      }
    });
    return run.status === 'SUCCEEDED' ? ExitCode.OK : ExitCode.ERROR;
  },
};

const jobsList: CliCommand = {
  name: 'jobs:list',
  summary: 'Background jobs and how often they run',
  description:
    'Run history is kept by the server process; see Security & compliance → Background\n' +
    'jobs in the application for the last run of each job.',
  examples: ['jobs:list'],
  run({ get, out }) {
    const jobs = get<JobScheduler>(JOB_SCHEDULER)
      .list()
      .map((job) => ({ name: job.name, everyMinutes: Math.round(job.everyMs / 60_000) }));
    out.emit({ jobs }, () => {
      out.table(
        [
          { header: 'JOB', value: (j) => j.name },
          {
            header: 'EVERY',
            value: (j) =>
              j.everyMinutes >= 60 ? `${j.everyMinutes / 60} h` : `${j.everyMinutes} min`,
            align: 'right',
          },
        ],
        jobs,
      );
    });
    return ExitCode.OK;
  },
};

const jobsRun: CliCommand = {
  name: 'jobs:run',
  summary: 'Run a background job now',
  description:
    'Honours the single-instance lock: with Redis the job is skipped when the server is\n' +
    'already running it. Exit code 1 when the job failed.',
  args: [{ name: 'job', description: 'Job name (see jobs:list)' }],
  mutates: true,
  audit: { action: 'CLI_JOB_TRIGGER', category: 'SYSTEM', resourceType: 'Job' },
  examples: ['jobs:run approval-expiry', 'jobs:run audit-chain-anchor --reason "CHG-1120"'],
  async run({ get, args, out, auditTarget }) {
    const scheduler = get<JobScheduler>(JOB_SCHEDULER);
    const name = args.job!;
    const known = scheduler.list().map((j) => j.name);
    if (!known.includes(name)) {
      throw new UsageError(`Unknown job "${name}". Jobs: ${known.join(', ')}`, 'jobs:run');
    }
    if (get<KeyValueStore>(KEY_VALUE_STORE).driver === 'memory') {
      out.warn('KV_STORE=memory: the single-instance lock is not shared with the server process.');
    }
    const result = await scheduler.trigger(name);
    const info = scheduler.list().find((j) => j.name === name);
    const failed = info?.lastStatus === 'failed';
    auditTarget(name, { result, status: info?.lastStatus ?? null });
    out.emit(
      { job: name, result, status: info?.lastStatus ?? null, error: info?.lastError ?? null },
      () => {
        if (result === 'skipped') out.info(`"${name}" is already running elsewhere; skipped.`);
        else if (failed) out.error(`"${name}" failed: ${info?.lastError ?? 'unknown error'}`);
        else out.success(`"${name}" finished.`);
      },
    );
    return failed ? ExitCode.ERROR : ExitCode.OK;
  },
};

export const complianceCommands: CliCommand[] = [
  auditStatus,
  auditVerify,
  auditAnchor,
  retentionPreview,
  retentionRun,
  jobsList,
  jobsRun,
];
