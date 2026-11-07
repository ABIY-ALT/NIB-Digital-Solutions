import { Injectable } from '@nestjs/common';
import type { ApprovalRequest as ApprovalRow, Prisma } from '#generated/prisma/client.js';
import { ConcurrencyError } from '#core/domain/errors/app-error.js';
import { createPage, type Page } from '#core/domain/pagination.js';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type { ApprovalQuery, ApprovalRepository } from '../application/approval.repository.js';
import { ApprovalRequest } from '../domain/approval-request.js';

type Json = Record<string, unknown> | null;

const toDomain = (r: ApprovalRow): ApprovalRequest =>
  ApprovalRequest.reconstitute({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    summary: r.summary,
    payload: (r.payload as Record<string, unknown>) ?? {},
    before: (r.before as Json) ?? null,
    after: (r.after as Json) ?? null,
    status: r.status,
    maker: { id: r.makerId, name: r.makerName },
    makerComment: r.makerComment,
    checker: r.checkerId ? { id: r.checkerId, name: r.checkerName ?? r.checkerId } : null,
    checkerComment: r.checkerComment,
    checkerPermissions: r.checkerPermissions,
    decidedAt: r.decidedAt,
    expiresAt: r.expiresAt,
    result: (r.result as Json) ?? null,
    errorCode: r.errorCode,
    correlationId: r.correlationId,
  });

const json = (v: Json) => (v ?? undefined) as Prisma.InputJsonValue | undefined;

@Injectable()
export class PrismaApprovalRepository implements ApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.db;
  }

  async create(request: ApprovalRequest): Promise<void> {
    const s = request.toSnapshot();
    await this.db.approvalRequest.create({
      data: {
        id: s.id,
        createdAt: s.createdAt,
        version: s.version,
        action: s.action,
        resourceType: s.resourceType,
        resourceId: s.resourceId,
        summary: s.summary,
        payload: s.payload as Prisma.InputJsonValue,
        before: json(s.before),
        after: json(s.after),
        status: s.status,
        makerId: s.maker.id,
        makerName: s.maker.name,
        makerComment: s.makerComment,
        checkerPermissions: s.checkerPermissions,
        expiresAt: s.expiresAt,
        correlationId: s.correlationId,
      },
    });
  }

  async findById(id: string): Promise<ApprovalRequest | null> {
    const row = await this.db.approvalRequest.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async update(request: ApprovalRequest): Promise<void> {
    const s = request.toSnapshot();
    const result = await this.db.approvalRequest.updateMany({
      where: { id: s.id, version: s.version },
      data: {
        status: s.status,
        checkerId: s.checker?.id ?? null,
        checkerName: s.checker?.name ?? null,
        checkerComment: s.checkerComment,
        decidedAt: s.decidedAt,
        result: json(s.result),
        errorCode: s.errorCode,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new ConcurrencyError('ApprovalRequest', s.id, s.version);
    request.syncVersion(s.version + 1);
  }

  async findPage(q: ApprovalQuery): Promise<Page<ApprovalRequest>> {
    const and: Prisma.ApprovalRequestWhereInput[] = [];
    switch (q.box) {
      case 'inbox':
        and.push({
          status: 'PENDING',
          makerId: { not: q.userId },
          action: { in: q.eligibleActions ?? [] },
          expiresAt: { gt: new Date() },
        });
        break;
      case 'mine':
        and.push({ makerId: q.userId });
        break;
      case 'history':
        and.push({ checkerId: q.userId });
        break;
      default:
        break;
    }
    if (q.status?.length) and.push({ status: { in: q.status } });
    if (q.action) and.push({ action: q.action });
    if (q.resourceType) and.push({ resourceType: q.resourceType });
    if (q.resourceId) and.push({ resourceId: q.resourceId });
    if (q.search) {
      and.push({
        OR: [
          { summary: { contains: q.search, mode: 'insensitive' } },
          { makerName: { contains: q.search, mode: 'insensitive' } },
          { action: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.db.approvalRequest.findMany({
        where,
        orderBy: q.box === 'inbox' ? { expiresAt: 'asc' } : { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.approvalRequest.count({ where }),
    ]);
    return createPage(rows.map(toDomain), total, q);
  }

  countInbox(userId: string, eligibleActions: string[]): Promise<number> {
    if (eligibleActions.length === 0) return Promise.resolve(0);
    return this.db.approvalRequest.count({
      where: {
        status: 'PENDING',
        makerId: { not: userId },
        action: { in: eligibleActions },
        expiresAt: { gt: new Date() },
      },
    });
  }

  countPendingByMaker(userId: string): Promise<number> {
    return this.db.approvalRequest.count({ where: { status: 'PENDING', makerId: userId } });
  }

  async findPendingFor(resourceType: string, resourceId: string): Promise<ApprovalRequest | null> {
    const row = await this.db.approvalRequest.findFirst({
      where: { resourceType, resourceId, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    return row ? toDomain(row) : null;
  }

  async pendingResourceIds(
    resourceType: string,
    resourceIds: string[],
  ): Promise<Map<string, string>> {
    if (resourceIds.length === 0) return new Map();
    const rows = await this.db.approvalRequest.findMany({
      where: {
        resourceType,
        resourceId: { in: resourceIds },
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: { id: true, resourceId: true },
    });
    return new Map(rows.map((r) => [r.resourceId!, r.id]));
  }

  async findExpired(now: Date, limit: number): Promise<ApprovalRequest[]> {
    const rows = await this.db.approvalRequest.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  countDecidedBefore(cutoff: Date): Promise<number> {
    return this.db.approvalRequest.count({
      where: { status: { not: 'PENDING' }, createdAt: { lt: cutoff } },
    });
  }

  async takeDecidedBefore(cutoff: Date, limit: number): Promise<ApprovalRequest[]> {
    const rows = await this.db.approvalRequest.findMany({
      where: { status: { not: 'PENDING' }, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async deleteByIds(ids: string[]): Promise<number> {
    const r = await this.db.approvalRequest.deleteMany({ where: { id: { in: ids } } });
    return r.count;
  }
}
