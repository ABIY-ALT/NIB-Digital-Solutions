import { Injectable } from '@nestjs/common';
import type { DigitalProduct as DigitalProductRecord, Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import {
  DigitalProduct,
  type DocSection,
  type ProductContent,
} from '../domain/digital-product.entity.js';
import type { DigitalProductRepository } from '../domain/digital-product.repository.js';

type DigitalProductWrite = Prisma.DigitalProductUncheckedCreateInput;

const asContent = (v: Prisma.JsonValue): ProductContent =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const asDocs = (v: Prisma.JsonValue): DocSection[] =>
  Array.isArray(v)
    ? v.flatMap((d) =>
        d &&
        typeof d === 'object' &&
        !Array.isArray(d) &&
        typeof d.title === 'string' &&
        typeof d.body === 'string'
          ? [{ title: d.title, body: d.body }]
          : [],
      )
    : [];

class DigitalProductMapper extends PersistenceMapper<
  DigitalProduct,
  DigitalProductRecord,
  DigitalProductWrite
> {
  toDomain(r: DigitalProductRecord): DigitalProduct {
    return DigitalProduct.reconstitute(
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
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        summary: r.summary,
        overview: r.overview,
        problem: r.problem,
        categoryCode: r.categoryCode,
        status: r.status,
        availability: r.availability,
        featured: r.featured,
        customizable: r.customizable,
        icon: r.icon,
        accent: r.accent,
        industries: r.industries,
        needs: r.needs,
        deployment: r.deployment,
        platforms: r.platforms,
        keyFeatures: r.keyFeatures,
        releaseDate: r.releaseDate ? r.releaseDate.toISOString().slice(0, 10) : null,
        developerId: r.developerId,
        backupDeveloperId: r.backupDeveloperId,
        thirdDeveloperId: r.thirdDeveloperId,
        supportStatus: r.supportStatus,
        content: asContent(r.content),
        documentation: asDocs(r.documentation),
      },
    );
  }

  toPersistence(e: DigitalProduct): DigitalProductWrite {
    const snapshot = e.toSnapshot();
    return {
      ...e.metadata,
      ...snapshot,
      content: snapshot.content as Prisma.InputJsonObject,
      documentation: snapshot.documentation as unknown as Prisma.InputJsonArray,
      releaseDate: snapshot.releaseDate ? new Date(`${snapshot.releaseDate}T00:00:00Z`) : null,
    };
  }
}

@Injectable()
export class PrismaDigitalProductRepository
  extends PrismaBaseRepository<DigitalProduct, DigitalProductRecord, DigitalProductWrite>
  implements DigitalProductRepository
{
  protected readonly resourceName = 'DigitalProduct';
  protected readonly mapper = new DigitalProductMapper();
  protected readonly querySpec: QuerySpec = {
    sortable: {
      slug: 'slug',
      name: 'name',
      categoryCode: 'categoryCode',
      status: 'status',
      availability: 'availability',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      slug: { column: 'slug', type: 'string' },
      name: { column: 'name', type: 'string' },
      categoryCode: { column: 'categoryCode', type: 'string' },
      status: { column: 'status', type: 'string' },
      availability: { column: 'availability', type: 'string' },
      featured: { column: 'featured', type: 'boolean' },
      customizable: { column: 'customizable', type: 'boolean' },
    },
    searchable: ['slug', 'name', 'tagline', 'summary', 'categoryCode'],
    defaultSort: [{ field: 'name', direction: 'asc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.digitalProduct;
  }

  findByUnique(field: 'slug', value: string | number): Promise<DigitalProduct | null> {
    return this.findOneWhere({ [field]: value }, { includeDeleted: true });
  }

  async findPublished(): Promise<DigitalProduct[]> {
    const rows = await this.delegate(this.prisma.db).findMany({
      where: { ...this.notDeleted(), status: 'published' },
      orderBy: [{ featured: 'desc' }, { name: 'asc' }],
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  findPublishedBySlug(slug: string): Promise<DigitalProduct | null> {
    return this.findOneWhere({ slug, status: 'published' });
  }
}
