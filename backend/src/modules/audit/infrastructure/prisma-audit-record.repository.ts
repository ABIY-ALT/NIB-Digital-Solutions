import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuditLog, Prisma } from '#generated/prisma/client.js';
import type { AuditRecord } from '#core/domain/audit-record.js';
import { ValidationError } from '#core/domain/errors/app-error.js';
import {
  createPage,
  pageOffset,
  type FilterCondition,
  type Page,
  type PageRequest,
} from '#core/domain/pagination.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { chainHash, GENESIS_HASH, type ChainRow } from '../application/audit-chain.js';
import {
  AUDIT_CHAIN_KEY,
  type AuditActivitySummary,
  type AuditChainStats,
  type AuditFacets,
  type AuditSubject,
  type PersonalActivitySummary,
  type AuditCheckpoint,
  type AuditCheckpointKind,
  type AuditRecordRepository,
  type AuditRecordView,
} from '../application/audit-record.repository.js';

const SORTABLE: Record<string, keyof AuditLog> = {
  occurredAt: 'occurredAt',
  action: 'action',
  outcome: 'outcome',
  seq: 'seq',
};
const FILTERABLE = new Set([
  'id',
  'seq',
  'action',
  'actorUsername',
  'ipAddress',
  'category',
  'outcome',
  'actorId',
  'resourceType',
  'resourceId',
  'correlationId',
  'occurredAt',
]);
const DATE_FIELDS = new Set(['occurredAt']);
const BIGINT_FIELDS = new Set(['seq']);

/** Serialises every chain write (append, seal, purge) across processes. */
const CHAIN_LOCK = 'SELECT pg_advisory_xact_lock(7300001)';
const TX = { maxWait: 10_000, timeout: 30_000 } as const;

/** Filter condition → Prisma where (dates are parsed; strings support every operator). */
function toWhere(f: FilterCondition): Prisma.AuditLogWhereInput {
  const isDate = DATE_FIELDS.has(f.field);
  const isBigInt = BIGINT_FIELDS.has(f.field);
  const parse = (v: string): string | Date | bigint => {
    if (isBigInt) {
      if (!/^\d{1,19}$/.test(v))
        throw new ValidationError([{ field: `filter[${f.field}]`, message: 'Invalid number' }]);
      return BigInt(v);
    }
    if (!isDate) return v;
    const d = new Date(v);
    if (Number.isNaN(d.getTime()))
      throw new ValidationError([{ field: `filter[${f.field}]`, message: 'Invalid date' }]);
    return d;
  };
  const values = (Array.isArray(f.value) ? f.value : [f.value]).map(parse);
  const one = values[0]!;
  switch (f.operator) {
    case 'in':
      return { [f.field]: { in: values } };
    case 'ne':
      return { [f.field]: { not: one } };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { [f.field]: { [f.operator]: one } };
    case 'contains':
      if (isDate || isBigInt)
        throw new ValidationError([
          { field: `filter[${f.field}]`, message: 'Unsupported operator' },
        ]);
      return { [f.field]: { contains: one, mode: 'insensitive' } };
    default:
      return { [f.field]: one };
  }
}

const toRow = (r: AuditLog): ChainRow => ({
  id: r.id,
  seq: r.seq,
  prevHash: r.prevHash,
  hash: r.hash,
  occurredAt: r.occurredAt,
  actorId: r.actorId,
  actorUsername: r.actorUsername,
  action: r.action,
  category: r.category as AuditRecord['category'],
  resourceType: r.resourceType,
  resourceId: r.resourceId,
  outcome: r.outcome,
  errorCode: r.errorCode,
  ipAddress: r.ipAddress,
  userAgent: r.userAgent,
  correlationId: r.correlationId,
  metadata: (r.metadata as Record<string, unknown> | null) ?? null,
});

const toCheckpoint = (c: {
  id: string;
  createdAt: Date;
  kind: AuditCheckpointKind;
  seq: bigint;
  hash: string;
  fromSeq: bigint | null;
  recordCount: number;
  archiveRef: string | null;
  createdBy: string | null;
}): AuditCheckpoint => ({ ...c });

/**
 * Audit records are written with the ROOT client (not the ambient transaction):
 * a rolled-back business transaction must still leave its audit trail. Each
 * append runs in its own short transaction holding the chain lock:
 *   tip hash → next seq → HMAC → insert (hash included)
 */
@Injectable()
export class PrismaAuditRecordRepository implements AuditRecordRepository {
  private readonly logger = new Logger('AuditChain');
  private backlogSealed = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUDIT_CHAIN_KEY) private readonly key: Buffer,
  ) {}

  async append(record: AuditRecord): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(CHAIN_LOCK);
      if (!this.backlogSealed) await this.sealPendingIn(tx);
      const prev = await this.tipHash(tx);
      const [next] = await tx.$queryRaw<Array<{ seq: bigint }>>`
        SELECT nextval(pg_get_serial_sequence('"audit_logs"', 'seq')) AS seq`;
      const row = {
        ...record,
        id: randomUUID(),
        seq: next!.seq,
        // Stored with millisecond precision: hash exactly what is persisted.
        occurredAt: new Date(record.occurredAt),
        metadata: record.metadata ?? null,
      };
      await tx.auditLog.create({
        data: {
          ...row,
          prevHash: prev,
          hash: chainHash(this.key, prev, row),
          metadata: (row.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    }, TX);
  }

  async findPage(request: PageRequest): Promise<Page<AuditRecordView>> {
    const and: Prisma.AuditLogWhereInput[] = [];
    for (const f of request.filters) {
      if (!FILTERABLE.has(f.field))
        throw new ValidationError([{ field: `filter[${f.field}]`, message: 'Unknown filter' }]);
      and.push(toWhere(f));
    }
    if (request.search) {
      and.push({
        OR: [
          { action: { contains: request.search, mode: 'insensitive' } },
          { actorUsername: { contains: request.search, mode: 'insensitive' } },
          { resourceId: { contains: request.search, mode: 'insensitive' } },
          { resourceType: { contains: request.search, mode: 'insensitive' } },
          { ipAddress: { contains: request.search, mode: 'insensitive' } },
          { correlationId: { equals: request.search } },
        ],
      });
    }
    const where: Prisma.AuditLogWhereInput = { AND: and };
    const orderBy = (
      request.sort.length ? request.sort : [{ field: 'occurredAt', direction: 'desc' as const }]
    ).map((s) => ({ [SORTABLE[s.field] ?? 'occurredAt']: s.direction }));
    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy,
        skip: pageOffset(request),
        take: request.pageSize,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);
    return createPage(
      rows.map((r) => toRow(r)),
      total,
      request,
    );
  }

  async findById(id: string): Promise<AuditRecordView | null> {
    const row = await this.prisma.client.auditLog.findUnique({ where: { id } });
    return row ? toRow(row) : null;
  }

  async summary(from: Date | null, to: Date | null): Promise<AuditActivitySummary> {
    const where: Prisma.AuditLogWhereInput = {
      occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
    };
    const db = this.prisma.client.auditLog;
    const [outcomes, categories, actions, actors] = await Promise.all([
      db.groupBy({ by: ['outcome'], where, _count: { _all: true } }),
      db.groupBy({ by: ['category'], where, _count: { _all: true } }),
      db.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 5,
      }),
      this.prisma.client.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(DISTINCT actor_id) AS n FROM audit_logs
        WHERE (${from}::timestamptz IS NULL OR occurred_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR occurred_at <= ${to}::timestamptz)`,
    ]);
    const byOutcome = (o: string) => outcomes.find((x) => x.outcome === o)?._count._all ?? 0;
    return {
      total: outcomes.reduce((n, x) => n + x._count._all, 0),
      failures: byOutcome('FAILURE'),
      denied: byOutcome('DENIED'),
      distinctActors: Number(actors[0]?.n ?? 0),
      byCategory: categories
        .map((c) => ({ category: c.category, count: c._count._all }))
        .sort((a, b) => b.count - a.count),
      topActions: actions.map((a) => ({ action: a.action, count: a._count.action })),
    };
  }

  async facets(): Promise<AuditFacets> {
    const db = this.prisma.client.auditLog;
    const [actions, types] = await Promise.all([
      db.groupBy({ by: ['action'], _count: { action: true }, orderBy: { action: 'asc' } }),
      db.groupBy({
        by: ['resourceType'],
        where: { resourceType: { not: null } },
        orderBy: { resourceType: 'asc' },
      }),
    ]);
    return {
      actions: actions.map((a) => ({ action: a.action, count: a._count.action })),
      resourceTypes: types.map((t) => t.resourceType).filter((t): t is string => t !== null),
    };
  }

  private subjectWhere(subject: AuditSubject): Prisma.AuditLogWhereInput {
    return {
      OR: [
        { actorId: subject.userId },
        { resourceType: 'User', resourceId: subject.userId },
        // Failed sign-ins happen before authentication: only the username is known.
        { actorId: null, actorUsername: subject.username, category: 'AUTHENTICATION' },
      ],
    };
  }

  async findForSubject(
    subject: AuditSubject,
    options: { beforeSeq: bigint | null; limit: number; excludeActions: readonly string[] },
  ): Promise<AuditRecordView[]> {
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        AND: [
          this.subjectWhere(subject),
          { action: { notIn: [...options.excludeActions] } },
          options.beforeSeq !== null ? { seq: { lt: options.beforeSeq } } : {},
        ],
      },
      orderBy: { seq: 'desc' },
      take: options.limit,
    });
    return rows.map((r) => toRow(r));
  }

  async summarizeForSubject(subject: AuditSubject, since: Date): Promise<PersonalActivitySummary> {
    const db = this.prisma.client.auditLog;
    const mine = this.subjectWhere(subject);
    const window = { occurredAt: { gte: since } };
    const [signIns, failedSignIns, changes, devices, lastFailed] = await Promise.all([
      db.count({
        where: { ...window, actorId: subject.userId, action: 'AUTH_LOGIN', outcome: 'SUCCESS' },
      }),
      db.count({
        where: { AND: [mine, window, { action: 'AUTH_LOGIN', outcome: { not: 'SUCCESS' } }] },
      }),
      db.count({
        where: {
          ...window,
          actorId: subject.userId,
          outcome: 'SUCCESS',
          category: { in: ['DATA_CHANGE', 'SECURITY', 'FINANCIAL'] },
        },
      }),
      db.groupBy({
        by: ['userAgent'],
        where: { ...window, actorId: subject.userId, action: 'AUTH_LOGIN', outcome: 'SUCCESS' },
      }),
      db.findFirst({
        where: { AND: [mine, { action: 'AUTH_LOGIN', outcome: { not: 'SUCCESS' } }] },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
    ]);
    return {
      signIns,
      failedSignIns,
      changes,
      devices: devices.filter((d) => d.userAgent).length,
      lastFailedSignInAt: lastFailed?.occurredAt ?? null,
    };
  }

  // ── Chain maintenance ─────────────────────────────────────────────────────

  async sealPending(): Promise<number> {
    const sealed = await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(CHAIN_LOCK);
      return this.sealPendingIn(tx);
    }, TX);
    if (sealed) this.logger.log({ sealed }, 'Sealed audit records into the hash chain');
    return sealed;
  }

  /** Seals unsealed rows in seq order, linking each to its sealed predecessor. */
  private async sealPendingIn(tx: DbClient): Promise<number> {
    let sealed = 0;
    for (;;) {
      const batch = await tx.auditLog.findMany({
        where: { hash: null },
        orderBy: { seq: 'asc' },
        take: 500,
      });
      if (batch.length === 0) break;
      let prev = await this.hashBefore(tx, batch[0]!.seq);
      for (const r of batch) {
        const hash = chainHash(this.key, prev, toRow(r));
        await tx.auditLog.update({ where: { id: r.id }, data: { prevHash: prev, hash } });
        prev = hash;
        sealed += 1;
      }
    }
    this.backlogSealed = true;
    return sealed;
  }

  /** Hash the row at `seq` must link to (sealed predecessor, purge checkpoint or genesis). */
  private async hashBefore(tx: DbClient, seq: bigint): Promise<string> {
    const prev = await tx.auditLog.findFirst({
      where: { seq: { lt: seq }, hash: { not: null } },
      orderBy: { seq: 'desc' },
      select: { hash: true },
    });
    if (prev?.hash) return prev.hash;
    const purge = await tx.auditCheckpoint.findFirst({
      where: { kind: 'PURGE' },
      orderBy: { seq: 'desc' },
      select: { hash: true },
    });
    return purge?.hash ?? GENESIS_HASH;
  }

  private async tipHash(tx: DbClient): Promise<string> {
    const last = await tx.auditLog.findFirst({
      where: { hash: { not: null } },
      orderBy: { seq: 'desc' },
      select: { hash: true },
    });
    if (last?.hash) return last.hash;
    const purge = await tx.auditCheckpoint.findFirst({
      where: { kind: 'PURGE' },
      orderBy: { seq: 'desc' },
      select: { hash: true },
    });
    return purge?.hash ?? GENESIS_HASH;
  }

  async readChain(afterSeq: bigint | null, limit: number): Promise<ChainRow[]> {
    const rows = await this.prisma.client.auditLog.findMany({
      where: afterSeq === null ? {} : { seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map(toRow);
  }

  async findBySeq(seq: bigint): Promise<ChainRow | null> {
    const row = await this.prisma.client.auditLog.findUnique({ where: { seq } });
    return row ? toRow(row) : null;
  }

  async head(): Promise<{ seq: bigint; hash: string } | null> {
    const last = await this.prisma.client.auditLog.findFirst({
      where: { hash: { not: null } },
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    });
    return last?.hash ? { seq: last.seq, hash: last.hash } : null;
  }

  async stats(): Promise<AuditChainStats> {
    const db = this.prisma.client.auditLog;
    const [total, unsealed, agg] = await Promise.all([
      db.count(),
      db.count({ where: { hash: null } }),
      db.aggregate({
        _min: { seq: true, occurredAt: true },
        _max: { seq: true, occurredAt: true },
      }),
    ]);
    return {
      total,
      unsealed,
      firstSeq: agg._min.seq,
      lastSeq: agg._max.seq,
      oldest: agg._min.occurredAt,
      newest: agg._max.occurredAt,
    };
  }

  // ── Checkpoints ───────────────────────────────────────────────────────────

  async createAnchor(createdBy: string | null): Promise<AuditCheckpoint | null> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(CHAIN_LOCK);
      const last = await tx.auditLog.findFirst({
        where: { hash: { not: null } },
        orderBy: { seq: 'desc' },
      });
      if (!last?.hash) return null;
      const count = await tx.auditLog.count();
      return toCheckpoint(
        await tx.auditCheckpoint.create({
          data: { kind: 'ANCHOR', seq: last.seq, hash: last.hash, recordCount: count, createdBy },
        }),
      );
    }, TX);
  }

  async latestCheckpoint(kind: AuditCheckpointKind): Promise<AuditCheckpoint | null> {
    const c = await this.prisma.client.auditCheckpoint.findFirst({
      where: { kind },
      orderBy: { seq: 'desc' },
    });
    return c ? toCheckpoint(c) : null;
  }

  async listCheckpoints(
    kind: AuditCheckpointKind | null,
    limit: number,
  ): Promise<AuditCheckpoint[]> {
    const rows = await this.prisma.client.auditCheckpoint.findMany({
      where: kind ? { kind } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toCheckpoint);
  }

  // ── Retention ─────────────────────────────────────────────────────────────

  countOlderThan(cutoff: Date): Promise<number> {
    return this.prisma.client.auditLog.count({ where: { occurredAt: { lt: cutoff } } });
  }

  async oldest(limit: number): Promise<ChainRow[]> {
    return this.readChain(null, limit);
  }

  async purgeThrough(
    first: ChainRow,
    last: ChainRow,
    count: number,
    archiveRef: string | null,
    createdBy: string | null,
  ): Promise<void> {
    if (!last.hash) throw new Error('Cannot purge unsealed audit records');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(CHAIN_LOCK);
      // Authorises DELETE for this transaction only (see the audit_logs trigger).
      await tx.$executeRawUnsafe(`SELECT set_config('appcore.audit_purge', 'on', true)`);
      await tx.auditCheckpoint.create({
        data: {
          kind: 'PURGE',
          seq: last.seq,
          hash: last.hash!,
          fromSeq: first.seq,
          recordCount: count,
          archiveRef,
          createdBy,
        },
      });
      const deleted = await tx.auditLog.deleteMany({ where: { seq: { lte: last.seq } } });
      if (deleted.count !== count) {
        throw new Error(`Audit purge mismatch: expected ${count}, deleted ${deleted.count}`);
      }
    }, TX);
  }
}
