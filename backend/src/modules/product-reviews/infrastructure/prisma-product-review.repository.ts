import { Injectable } from '@nestjs/common';
import type { ProductReview as ProductReviewRecord, Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { ProductReview } from '../domain/product-review.entity.js';
import type {
  ProductReviewRepository,
  RatingSummary,
} from '../domain/product-review.repository.js';

type ProductReviewWrite = Prisma.ProductReviewUncheckedCreateInput;

class ProductReviewMapper extends PersistenceMapper<
  ProductReview,
  ProductReviewRecord,
  ProductReviewWrite
> {
  toDomain(r: ProductReviewRecord): ProductReview {
    return ProductReview.reconstitute(
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
        productSlug: r.productSlug,
        rating: r.rating,
        title: r.title,
        body: r.body,
        reviewerName: r.reviewerName,
        reviewerRole: r.reviewerRole,
        reviewerEmail: r.reviewerEmail,
        status: r.status,
        reply: r.reply,
        ipHash: r.ipHash,
      },
    );
  }

  toPersistence(e: ProductReview): ProductReviewWrite {
    return { ...e.metadata, ...e.toSnapshot() };
  }
}

@Injectable()
export class PrismaProductReviewRepository
  extends PrismaBaseRepository<ProductReview, ProductReviewRecord, ProductReviewWrite>
  implements ProductReviewRepository
{
  protected readonly resourceName = 'ProductReview';
  protected readonly mapper = new ProductReviewMapper();
  protected readonly querySpec: QuerySpec = {
    sortable: {
      reference: 'reference',
      productSlug: 'productSlug',
      rating: 'rating',
      title: 'title',
      reviewerName: 'reviewerName',
      reviewerRole: 'reviewerRole',
      reviewerEmail: 'reviewerEmail',
      status: 'status',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      reference: { column: 'reference', type: 'string' },
      productSlug: { column: 'productSlug', type: 'string' },
      rating: { column: 'rating', type: 'number' },
      title: { column: 'title', type: 'string' },
      reviewerName: { column: 'reviewerName', type: 'string' },
      reviewerRole: { column: 'reviewerRole', type: 'string' },
      reviewerEmail: { column: 'reviewerEmail', type: 'string' },
      status: { column: 'status', type: 'string' },
    },
    searchable: [
      'reference',
      'productSlug',
      'title',
      'body',
      'reviewerName',
      'reviewerRole',
      'reviewerEmail',
      'status',
      'reply',
    ],
    // Newest first: the moderation queue.
    defaultSort: [{ field: 'createdAt', direction: 'desc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.productReview;
  }

  findByUnique(field: 'reference', value: string | number): Promise<ProductReview | null> {
    return this.findOneWhere({ [field]: value }, { includeDeleted: true });
  }

  async summaries(): Promise<Map<string, RatingSummary>> {
    const rows = await this.prisma.db.productReview.groupBy({
      by: ['productSlug', 'rating'],
      where: { status: 'approved', deletedAt: null },
      _count: { _all: true },
    });
    const totals = new Map<string, { sum: number; distribution: RatingSummary['distribution'] }>();
    for (const row of rows) {
      const entry = totals.get(row.productSlug) ?? { sum: 0, distribution: [0, 0, 0, 0, 0] };
      const stars = Math.min(5, Math.max(1, row.rating));
      entry.distribution[stars - 1] = (entry.distribution[stars - 1] ?? 0) + row._count._all;
      entry.sum += stars * row._count._all;
      totals.set(row.productSlug, entry);
    }
    const result = new Map<string, RatingSummary>();
    for (const [slug, { sum, distribution }] of totals) {
      const count = distribution.reduce((a, b) => a + b, 0);
      if (count)
        result.set(slug, { average: Math.round((sum / count) * 10) / 10, count, distribution });
    }
    return result;
  }

  async featured(minRating: number): Promise<Map<string, ProductReview>> {
    const rows = await this.prisma.db.productReview.findMany({
      where: { status: 'approved', deletedAt: null, rating: { gte: minRating } },
      orderBy: [{ createdAt: 'desc' }],
      distinct: ['productSlug'],
    });
    return new Map(rows.map((r) => [r.productSlug, this.mapper.toDomain(r)]));
  }

  async findApproved(
    productSlug: string,
    { rating, limit }: { rating?: number; limit: number },
  ): Promise<ProductReview[]> {
    const rows = await this.prisma.db.productReview.findMany({
      where: { productSlug, status: 'approved', deletedAt: null, ...(rating ? { rating } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
    return rows.map((r) => this.mapper.toDomain(r));
  }

  countRecentFromIp(ipHash: string, since: Date): Promise<number> {
    return this.prisma.db.productReview.count({ where: { ipHash, createdAt: { gte: since } } });
  }

  async existsFor(productSlug: string, reviewerEmail: string): Promise<boolean> {
    const found = await this.prisma.db.productReview.findFirst({
      where: {
        productSlug,
        reviewerEmail: reviewerEmail.trim().toLowerCase(),
        status: { in: ['pending', 'approved'] },
        deletedAt: null,
      },
      select: { id: true },
    });
    return !!found;
  }
}
