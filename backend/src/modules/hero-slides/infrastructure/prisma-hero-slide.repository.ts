import { Injectable } from '@nestjs/common';
import type { HeroSlide as HeroSlideRecord, Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { HeroSlide } from '../domain/hero-slide.entity.js';
import type { HeroSlideRepository } from '../domain/hero-slide.repository.js';

type HeroSlideWrite = Prisma.HeroSlideUncheckedCreateInput;

class HeroSlideMapper extends PersistenceMapper<HeroSlide, HeroSlideRecord, HeroSlideWrite> {
  toDomain(r: HeroSlideRecord): HeroSlide {
    return HeroSlide.reconstitute(
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
        title: r.title,
        description: r.description,
        ctaLabel: r.ctaLabel,
        ctaHref: r.ctaHref,
        desktopImageId: r.desktopImageId,
        mobileImageId: r.mobileImageId,
        altText: r.altText,
        sortOrder: r.sortOrder,
        active: r.active,
      },
    );
  }

  toPersistence(e: HeroSlide): HeroSlideWrite {
    return { ...e.metadata, ...e.toSnapshot() };
  }
}

@Injectable()
export class PrismaHeroSlideRepository
  extends PrismaBaseRepository<HeroSlide, HeroSlideRecord, HeroSlideWrite>
  implements HeroSlideRepository
{
  protected readonly resourceName = 'HeroSlide';
  protected readonly mapper = new HeroSlideMapper();
  protected readonly querySpec: QuerySpec = {
    sortable: {
      title: 'title',
      ctaLabel: 'ctaLabel',
      ctaHref: 'ctaHref',
      desktopImageId: 'desktopImageId',
      mobileImageId: 'mobileImageId',
      altText: 'altText',
      sortOrder: 'sortOrder',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      title: { column: 'title', type: 'string' },
      ctaLabel: { column: 'ctaLabel', type: 'string' },
      ctaHref: { column: 'ctaHref', type: 'string' },
      desktopImageId: { column: 'desktopImageId', type: 'string' },
      mobileImageId: { column: 'mobileImageId', type: 'string' },
      altText: { column: 'altText', type: 'string' },
      sortOrder: { column: 'sortOrder', type: 'number' },
      active: { column: 'active', type: 'boolean' },
    },
    searchable: [
      'title',
      'description',
      'ctaLabel',
      'ctaHref',
      'desktopImageId',
      'mobileImageId',
      'altText',
    ],
    defaultSort: [{ field: 'sortOrder', direction: 'asc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.heroSlide;
  }

  async findOrdered(options: { activeOnly?: boolean } = {}): Promise<HeroSlide[]> {
    const rows = await this.delegate(this.prisma.db).findMany({
      where: { ...this.notDeleted(), ...(options.activeOnly ? { active: true } : {}) },
      orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 100,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async missingMedia(ids: readonly string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const found = await this.prisma.db.marketplaceMedia.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    const known = new Set(found.map((m) => m.id));
    return unique.filter((id) => !known.has(id));
  }
}
