import { Injectable } from '@nestjs/common';
import type { Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import type { EntityMetadata } from '#core/domain/base.entity.js';
import type { FindOptions } from '#core/domain/repository.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import {
  ReferenceDataItem,
  ReferenceDataType,
  type AttributeDefinition,
  type AttributeValue,
} from '../domain/reference-data.js';
import type {
  ReferenceDataItemRepository,
  ReferenceDataTypeRepository,
} from '../domain/reference-data.repository.js';

const meta = (r: EntityMetadata): EntityMetadata => ({
  id: r.id,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  createdBy: r.createdBy,
  updatedBy: r.updatedBy,
  version: r.version,
  deletedAt: r.deletedAt,
  deletedBy: r.deletedBy,
});

// ── Types ────────────────────────────────────────────────────────────────────

const typeInclude = {
  _count: { select: { items: { where: { deletedAt: null } } } },
} satisfies Prisma.ReferenceDataTypeInclude;
type TypeRecord = Prisma.ReferenceDataTypeGetPayload<{ include: typeof typeInclude }> & {
  activeCount?: number;
};
type TypeWrite = Prisma.ReferenceDataTypeUncheckedCreateInput;

class TypeMapper extends PersistenceMapper<ReferenceDataType, TypeRecord, TypeWrite> {
  toDomain(r: TypeRecord): ReferenceDataType {
    return ReferenceDataType.reconstitute(meta(r), {
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      attributes: (r.attributes as unknown as AttributeDefinition[]) ?? [],
      parentTypeCode: r.parentTypeCode,
      itemCount: r._count.items,
      activeCount: r.activeCount ?? r._count.items,
    });
  }

  toPersistence(t: ReferenceDataType): TypeWrite {
    const s = t.toSnapshot();
    return {
      ...t.metadata,
      code: s.code,
      name: s.name,
      description: s.description,
      isSystem: s.isSystem,
      attributes: s.attributes as unknown as Prisma.InputJsonValue,
      parentTypeCode: s.parentTypeCode,
    };
  }
}

@Injectable()
export class PrismaReferenceDataTypeRepository
  extends PrismaBaseRepository<ReferenceDataType, TypeRecord, TypeWrite>
  implements ReferenceDataTypeRepository
{
  protected readonly resourceName = 'ReferenceDataType';
  protected readonly mapper = new TypeMapper();
  protected override readonly include = typeInclude;
  protected readonly querySpec: QuerySpec = {
    sortable: { code: 'code', name: 'name', createdAt: 'createdAt' },
    filterable: { isSystem: { column: 'isSystem', type: 'boolean' } },
    searchable: ['code', 'name', 'description'],
    defaultSort: [{ field: 'name', direction: 'asc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.referenceDataType;
  }

  findByCode(code: string, options?: FindOptions): Promise<ReferenceDataType | null> {
    return this.findOneWhere({ code: code.trim().toLowerCase() }, options);
  }

  /** Adds the active-item count to each page (one grouped query). */
  override async findPage(
    request: PageRequest,
    options?: FindOptions,
  ): Promise<Page<ReferenceDataType>> {
    const page = await super.findPage(request, options);
    const ids = page.items.map((t) => t.id);
    const active = await this.db.referenceDataItem.groupBy({
      by: ['typeId'],
      where: { typeId: { in: ids }, deletedAt: null, active: true },
      _count: { _all: true },
    });
    const counts = new Map(active.map((a) => [a.typeId, a._count._all]));
    return {
      ...page,
      items: page.items.map((t) => {
        const s = t.toSnapshot();
        return ReferenceDataType.reconstitute(t.metadata, {
          ...s,
          activeCount: counts.get(t.id) ?? 0,
        });
      }),
    };
  }
}

// ── Items ────────────────────────────────────────────────────────────────────

const itemInclude = { type: { select: { code: true } } } satisfies Prisma.ReferenceDataItemInclude;
type ItemRecord = Prisma.ReferenceDataItemGetPayload<{ include: typeof itemInclude }>;
type ItemWrite = Prisma.ReferenceDataItemUncheckedCreateInput;

class ItemMapper extends PersistenceMapper<ReferenceDataItem, ItemRecord, ItemWrite> {
  toDomain(r: ItemRecord): ReferenceDataItem {
    return ReferenceDataItem.reconstitute(meta(r), {
      typeId: r.typeId,
      typeCode: r.type.code,
      code: r.code,
      label: r.label,
      labels: (r.labels as Record<string, string>) ?? {},
      description: r.description,
      sortOrder: r.sortOrder,
      active: r.active,
      validFrom: r.validFrom,
      validTo: r.validTo,
      parentCode: r.parentCode,
      attributes: (r.attributes as Record<string, AttributeValue>) ?? {},
    });
  }

  toPersistence(i: ReferenceDataItem): ItemWrite {
    const s = i.toSnapshot();
    return {
      ...i.metadata,
      typeId: s.typeId,
      code: s.code,
      label: s.label,
      labels: s.labels,
      description: s.description,
      sortOrder: s.sortOrder,
      active: s.active,
      validFrom: s.validFrom,
      validTo: s.validTo,
      parentCode: s.parentCode,
      attributes: s.attributes,
    };
  }
}

@Injectable()
export class PrismaReferenceDataItemRepository
  extends PrismaBaseRepository<ReferenceDataItem, ItemRecord, ItemWrite>
  implements ReferenceDataItemRepository
{
  protected readonly resourceName = 'ReferenceDataItem';
  protected readonly mapper = new ItemMapper();
  protected override readonly include = itemInclude;
  protected readonly querySpec: QuerySpec = {
    sortable: {
      code: 'code',
      label: 'label',
      sortOrder: 'sortOrder',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      active: { column: 'active', type: 'boolean' },
      parentCode: { column: 'parentCode', type: 'string' },
      code: { column: 'code', type: 'string' },
    },
    searchable: ['code', 'label', 'description'],
    defaultSort: [
      { field: 'sortOrder', direction: 'asc' },
      { field: 'label', direction: 'asc' },
    ],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.referenceDataItem;
  }

  findByCode(
    typeId: string,
    code: string,
    options?: FindOptions,
  ): Promise<ReferenceDataItem | null> {
    return this.findOneWhere({ typeId, code: code.trim().toUpperCase() }, options);
  }

  findPageForType(typeId: string, request: PageRequest): Promise<Page<ReferenceDataItem>> {
    return this.findPage(request, undefined, { typeId });
  }

  async findAllForType(typeId: string): Promise<ReferenceDataItem[]> {
    const rows = await this.db.referenceDataItem.findMany({
      where: { typeId, deletedAt: null },
      include: itemInclude,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      take: 5_000,
    });
    return rows.map((r) => this.mapper.toDomain(r));
  }
}
