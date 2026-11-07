import { describe, expect, it, vi } from 'vitest';
import type { AuditLogger } from '#core/application/ports/audit-logger.port.js';
import type {
  ArchiveStorage,
  RetentionPolicy,
  RetentionRegistry,
} from '#core/application/ports/retention.port.js';
import { RetentionService, type RetentionRunRepository } from './retention.service.js';

const policy = (overrides: Partial<RetentionPolicy> & { id: string }): RetentionPolicy => ({
  dataset: overrides.id,
  description: `${overrides.id} records`,
  retentionDays: 30,
  archive: false,
  count: vi.fn(() => Promise.resolve(0)),
  purge: vi.fn(() => Promise.resolve({ purged: 0, archived: 0 })),
  ...overrides,
});

function setup(policies: RetentionPolicy[]) {
  const registry = { list: () => policies, register: vi.fn() } as RetentionRegistry;
  const close = vi.fn(() => Promise.resolve('archive/run-1/audit.jsonl'));
  const archives = {
    open: vi.fn(() => Promise.resolve({ write: vi.fn(), close })),
  } as unknown as ArchiveStorage;
  const runs = {
    start: vi.fn(() => Promise.resolve('run-1')),
    finish: vi.fn(() => Promise.resolve(undefined)),
    findPage: vi.fn(() => Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 })),
  } as unknown as RetentionRunRepository;
  const audit = { record: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditLogger;
  const service = new RetentionService(registry, archives, runs, { batchSize: 250 }, audit);
  return { service, archives, close, runs, audit };
}

describe('RetentionService', () => {
  it('describes its policies and previews what a run would remove', async () => {
    const audit = policy({
      id: 'audit',
      retentionDays: 365,
      archive: true,
      basis: 'NBE directive',
      count: vi.fn(() => Promise.resolve(12)),
    });
    const { service } = setup([audit, policy({ id: 'sessions' })]);
    expect(service.policies()).toEqual([
      {
        id: 'audit',
        dataset: 'audit',
        description: 'audit records',
        retentionDays: 365,
        archive: true,
        basis: 'NBE directive',
      },
      {
        id: 'sessions',
        dataset: 'sessions',
        description: 'sessions records',
        retentionDays: 30,
        archive: false,
        basis: null,
      },
    ]);
    const now = new Date('2026-06-01T00:00:00Z');
    expect(await service.preview(now)).toEqual([
      { policy: 'audit', cutoff: '2025-06-01T00:00:00.000Z', matched: 12 },
      { policy: 'sessions', cutoff: '2026-05-02T00:00:00.000Z', matched: 0 },
    ]);
  });

  it('archives and purges each policy, and records the run', async () => {
    const audit = policy({
      id: 'audit',
      archive: true,
      count: vi.fn(() => Promise.resolve(5)),
      purge: vi.fn(() => Promise.resolve({ purged: 5, archived: 5, notes: 'chain checkpointed' })),
    });
    const sessions = policy({
      id: 'sessions',
      count: vi.fn(() => Promise.resolve(2)),
      purge: vi.fn(() => Promise.resolve({ purged: 2, archived: 0 })),
    });
    const empty = policy({ id: 'empty' });
    const { service, archives, close, runs, audit: logger } = setup([audit, sessions, empty]);

    const run = await service.run({
      trigger: 'MANUAL',
      dryRun: false,
      actor: { id: 'u1', username: 'admin' },
    });
    expect(run).toMatchObject({
      id: 'run-1',
      status: 'SUCCEEDED',
      trigger: 'MANUAL',
      triggeredBy: 'u1',
    });
    expect(run.results.map((r) => [r.policy, r.matched, r.purged, r.archiveRef, r.notes])).toEqual([
      ['audit', 5, 5, 'archive/run-1/audit.jsonl', 'chain checkpointed'],
      ['sessions', 2, 2, null, null],
      ['empty', 0, 0, null, null],
    ]);
    expect(archives.open).toHaveBeenCalledWith('audit', 'run-1');
    expect(close).toHaveBeenCalledTimes(1);
    expect(audit.purge).toHaveBeenCalledWith(
      expect.any(Date),
      expect.objectContaining({ runId: 'run-1', batchSize: 250 }),
    );
    expect(empty.purge).not.toHaveBeenCalled();
    expect(runs.finish).toHaveBeenCalledWith('run-1', 'SUCCEEDED', run.results, null);
    expect(logger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RETENTION_RUN',
        outcome: 'SUCCESS',
        metadata: expect.objectContaining({ purged: 7 }),
      }),
    );
  });

  it('only counts on a dry run', async () => {
    const audit = policy({ id: 'audit', archive: true, count: vi.fn(() => Promise.resolve(3)) });
    const { service, archives, audit: logger } = setup([audit]);
    const run = await service.run({ trigger: 'SCHEDULED', dryRun: true, actor: null });
    expect(run.results[0]).toMatchObject({ matched: 3, purged: 0 });
    expect(audit.purge).not.toHaveBeenCalled();
    expect(archives.open).not.toHaveBeenCalled();
    expect(logger.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RETENTION_PREVIEW', actorUsername: 'system' }),
    );
  });

  it('records a failing policy without stopping the others, and still closes its archive', async () => {
    const broken = policy({
      id: 'broken',
      archive: true,
      count: vi.fn(() => Promise.resolve(1)),
      purge: vi.fn(() => Promise.reject(new Error('disk full'))),
    });
    const odd = policy({
      id: 'odd',
      count: vi.fn(() =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the service must cope with non-Error failures
        Promise.reject('not an error object'),
      ),
    });
    const fine = policy({
      id: 'fine',
      count: vi.fn(() => Promise.resolve(1)),
      purge: vi.fn(() => Promise.resolve({ purged: 1, archived: 0 })),
    });
    const { service, close, runs, audit: logger } = setup([broken, odd, fine]);
    const run = await service.run({ trigger: 'SCHEDULED', dryRun: false, actor: null });
    expect(run.status).toBe('FAILED');
    expect(run.results.map((r) => r.error)).toEqual(['disk full', 'not an error object', null]);
    expect(run.results[0]!.archiveRef).toBe('archive/run-1/audit.jsonl');
    expect(close).toHaveBeenCalled();
    expect(run.results[2]!.purged).toBe(1);
    expect(runs.finish).toHaveBeenCalledWith('run-1', 'FAILED', expect.any(Array), null);
    expect(logger.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'FAILURE', errorCode: 'RETENTION_POLICY_FAILED' }),
    );
  });

  it('lists past runs', async () => {
    const { service, runs } = setup([]);
    await service.listRuns(2, 10);
    expect(runs.findPage).toHaveBeenCalledWith(2, 10);
  });
});
