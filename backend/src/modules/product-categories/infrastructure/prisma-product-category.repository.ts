import { Injectable } from '@nestjs/common';
import type { ProductCategory as ProductCategoryRecord, Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { ProductCategory } from '../domain/product-category.entity.js';
import type { ProductCategoryRepository } from '../domain/product-category.repository.js';

type ProductCategoryWrite = Prisma.ProductCategoryUncheckedCreateInput;

class ProductCategoryMapper extends PersistenceMapper<
  ProductCategory,
  ProductCategoryRecord,
  ProductCategoryWrite
> {
  toDomain(r: ProductCategoryRecord): ProductCategory {
    return ProductCategory.reconstitute(
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
        code: r.code,
        name: r.name,
        description: r.description,
        icon: r.icon,
        sortOrder: r.sortOrder,
      },
    );
  }

  toPersistence(e: ProductCategory): ProductCategoryWrite {
    return { ...e.metadata, ...e.toSnapshot() };
  }
}

@Injectable()
export class PrismaProductCategoryRepository
  extends PrismaBaseRepository<ProductCategory, ProductCategoryRecord, ProductCategoryWrite>
  implements ProductCategoryRepository
{
  protected readonly resourceName = 'ProductCategory';
  protected readonly mapper = new ProductCategoryMapper();
  protected readonly querySpec: QuerySpec = {
    sortable: {
      code: 'code',
      name: 'name',
      icon: 'icon',
      sortOrder: 'sortOrder',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      code: { column: 'code', type: 'string' },
      name: { column: 'name', type: 'string' },
      icon: { column: 'icon', type: 'string' },
      sortOrder: { column: 'sortOrder', type: 'number' },
    },
    searchable: ['code', 'name', 'description', 'icon'],
    defaultSort: [{ field: 'code', direction: 'asc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.productCategory;
  }

  findByUnique(field: 'code', value: string | number): Promise<ProductCategory | null> {
    return this.findOneWhere({ [field]: value }, { includeDeleted: true });
  }

  async findAllOrdered(): Promise<ProductCategory[]> {
    const rows = await this.delegate(this.prisma.db).findMany({
      where: this.notDeleted(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }
}
