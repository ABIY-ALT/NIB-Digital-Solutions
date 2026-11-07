import { Injectable } from '@nestjs/common';
import type { Prisma } from '#generated/prisma/client.js';
import { createPage, type Page } from '#core/domain/pagination.js';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type {
  RetentionPolicyResult,
  RetentionRunRecord,
  RetentionRunRepository,
} from '../application/retention.service.js';

@Injectable()
export class PrismaRetentionRunRepository implements RetentionRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async start(
    run: Omit<RetentionRunRecord, 'id' | 'finishedAt' | 'results' | 'error'>,
  ): Promise<string> {
    const created = await this.prisma.client.retentionRun.create({
      data: {
        startedAt: run.startedAt,
        trigger: run.trigger,
        dryRun: run.dryRun,
        status: 'RUNNING',
        triggeredBy: run.triggeredBy,
      },
      select: { id: true },
    });
    return created.id;
  }

  async finish(
    id: string,
    status: 'SUCCEEDED' | 'FAILED',
    results: RetentionPolicyResult[],
    error: string | null,
  ): Promise<void> {
    await this.prisma.client.retentionRun.update({
      where: { id },
      data: {
        status,
        finishedAt: new Date(),
        results: results as unknown as Prisma.InputJsonValue,
        error,
      },
    });
  }

  async findPage(page: number, pageSize: number): Promise<Page<RetentionRunRecord>> {
    const [rows, total] = await Promise.all([
      this.prisma.client.retentionRun.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.retentionRun.count(),
    ]);
    return createPage(
      rows.map((r) => ({
        id: r.id,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        trigger: r.trigger as RetentionRunRecord['trigger'],
        dryRun: r.dryRun,
        status: r.status,
        triggeredBy: r.triggeredBy,
        results: (r.results as unknown as RetentionPolicyResult[]) ?? [],
        error: r.error,
      })),
      total,
      { page, pageSize },
    );
  }
}
