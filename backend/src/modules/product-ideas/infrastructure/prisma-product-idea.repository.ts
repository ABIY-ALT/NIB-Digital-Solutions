import { Injectable } from '@nestjs/common';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import type { Prisma, ProductIdea as ProductIdeaRecord } from '#generated/prisma/client.js';
import { ProductIdea, PUBLIC_IDEA_STATUSES } from '../domain/product-idea.entity.js';
import type {
  ProductIdeaRepository,
  PublicIdeaQuery,
  VoteOutcome,
} from '../domain/product-idea.repository.js';

type ProductIdeaWrite = Prisma.ProductIdeaUncheckedCreateInput;

class ProductIdeaMapper extends PersistenceMapper<
  ProductIdea,
  ProductIdeaRecord,
  ProductIdeaWrite
> {
  toDomain(r: ProductIdeaRecord): ProductIdea {
    return ProductIdea.reconstitute(
      {
        id: r.id,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdBy: r.createdBy,
        updatedBy: r.updatedBy,
        version: r.version,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
      },
      {
        reference: r.reference,
        title: r.title,
        problem: r.problem,
        categoryCode: r.categoryCode,
        submitterName: r.submitterName,
        submitterEmail: r.submitterEmail,
        status: r.status,
        voteCount: r.voteCount,
        adminNote: r.adminNote,
        titleKey: r.titleKey,
        ipHash: r.ipHash,
      },
    );
  }

  toPersistence(e: ProductIdea): ProductIdeaWrite {
    return { ...e.metadata, ...e.toSnapshot() };
  }
}

@Injectable()
export class PrismaProductIdeaRepository
  extends PrismaBaseRepository<ProductIdea, ProductIdeaRecord, ProductIdeaWrite>
  implements ProductIdeaRepository
{
  protected readonly resourceName = 'ProductIdea';
  protected readonly mapper = new ProductIdeaMapper();
  // The submitter's e-mail and IP hash are personal data: kept out of the audit diff values.
  protected override readonly auditDiff = {
    redact: ['submitterEmail', 'ipHash'],
    ignore: ['titleKey'],
  };
  protected readonly querySpec: QuerySpec = {
    sortable: {
      reference: 'reference',
      title: 'title',
      categoryCode: 'categoryCode',
      status: 'status',
      voteCount: 'voteCount',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      reference: { column: 'reference', type: 'string' },
      title: { column: 'title', type: 'string' },
      categoryCode: { column: 'categoryCode', type: 'string' },
      submitterEmail: { column: 'submitterEmail', type: 'string' },
      status: { column: 'status', type: 'string' },
      voteCount: { column: 'voteCount', type: 'number' },
    },
    searchable: ['reference', 'title', 'problem', 'submitterName', 'submitterEmail'],
    defaultSort: [{ field: 'createdAt', direction: 'desc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.productIdea;
  }

  async findPublic(query: PublicIdeaQuery): Promise<ProductIdea[]> {
    const rows = await this.prisma.db.productIdea.findMany({
      where: {
        deletedAt: null,
        status: { in: query.status ? [query.status] : [...PUBLIC_IDEA_STATUSES] },
        ...(query.category ? { categoryCode: query.category } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { problem: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy:
        query.sort === 'newest'
          ? [{ createdAt: 'desc' }]
          : [{ voteCount: 'desc' }, { createdAt: 'desc' }],
      take: query.limit,
    });
    return rows.map((r) => this.toDomain(r));
  }

  findByUnique(field: 'reference', value: string | number): Promise<ProductIdea | null> {
    return this.findOneWhere({ [field]: value }, { includeDeleted: true });
  }

  findByReference(reference: string): Promise<ProductIdea | null> {
    return this.findOneWhere({ reference });
  }

  findByTitleKey(titleKey: string): Promise<ProductIdea | null> {
    return this.findOneWhere({ titleKey, status: { not: 'rejected' } });
  }

  countRecentFromIp(ipHash: string, since: Date): Promise<number> {
    return this.prisma.db.productIdea.count({ where: { ipHash, createdAt: { gte: since } } });
  }

  async vote(
    ideaId: string,
    voterHash: string,
    ipHash: string,
    maxPerNetwork: { count: number; since: Date },
  ): Promise<VoteOutcome> {
    return this.prisma.transaction(async () => {
      const db = this.prisma.db;
      const already = await db.productIdeaVote.findUnique({
        where: { ideaId_voterHash: { ideaId, voterHash } },
        select: { id: true },
      });
      if (already) return 'already';
      const fromNetwork = await db.productIdeaVote.count({
        where: { ideaId, ipHash, createdAt: { gte: maxPerNetwork.since } },
      });
      if (fromNetwork >= maxPerNetwork.count) return 'limited';
      try {
        await db.productIdeaVote.create({ data: { ideaId, voterHash, ipHash } });
      } catch (error) {
        // Two clicks racing: the unique (idea, voter) constraint lets only one through.
        if ((error as { code?: string }).code === 'P2002') return 'already';
        throw error;
      }
      await db.productIdea.update({
        where: { id: ideaId },
        data: { voteCount: { increment: 1 } },
      });
      return 'counted';
    });
  }

  async votedBy(voterHash: string, ideaIds: readonly string[]): Promise<Set<string>> {
    if (!ideaIds.length) return new Set();
    const rows = await this.prisma.db.productIdeaVote.findMany({
      where: { voterHash, ideaId: { in: [...ideaIds] } },
      select: { ideaId: true },
    });
    return new Set(rows.map((r) => r.ideaId));
  }
}
