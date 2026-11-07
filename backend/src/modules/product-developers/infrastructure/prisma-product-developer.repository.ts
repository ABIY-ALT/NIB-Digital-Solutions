import { Injectable } from '@nestjs/common';
import type {
  ProductDeveloper as ProductDeveloperRecord,
  Prisma,
} from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { ProductDeveloper } from '../domain/product-developer.entity.js';
import type { ProductDeveloperRepository } from '../domain/product-developer.repository.js';

type ProductDeveloperWrite = Prisma.ProductDeveloperUncheckedCreateInput;

class ProductDeveloperMapper extends PersistenceMapper<
  ProductDeveloper,
  ProductDeveloperRecord,
  ProductDeveloperWrite
> {
  toDomain(r: ProductDeveloperRecord): ProductDeveloper {
    return ProductDeveloper.reconstitute(
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
        name: r.name,
        email: r.email,
        telegramChatId: r.telegramChatId,
        telegramUsername: r.telegramUsername,
        active: r.active,
        telegramLinkCodeHash: r.telegramLinkCodeHash,
        telegramLinkExpiresAt: r.telegramLinkExpiresAt,
        telegramLinkedAt: r.telegramLinkedAt,
      },
    );
  }

  toPersistence(e: ProductDeveloper): ProductDeveloperWrite {
    return { ...e.metadata, ...e.toSnapshot() };
  }
}

@Injectable()
export class PrismaProductDeveloperRepository
  extends PrismaBaseRepository<ProductDeveloper, ProductDeveloperRecord, ProductDeveloperWrite>
  implements ProductDeveloperRepository
{
  protected readonly resourceName = 'ProductDeveloper';
  protected readonly mapper = new ProductDeveloperMapper();
  // The link code hash is a secret; the chat id is personal: values stay out of the audit trail.
  protected override readonly auditDiff = {
    redact: ['telegramChatId', 'telegramLinkCodeHash'],
    ignore: ['telegramLinkExpiresAt'],
  };
  protected readonly querySpec: QuerySpec = {
    sortable: {
      name: 'name',
      email: 'email',
      active: 'active',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      name: { column: 'name', type: 'string' },
      email: { column: 'email', type: 'string' },
      active: { column: 'active', type: 'boolean' },
    },
    searchable: ['name', 'email', 'telegramUsername'],
    defaultSort: [{ field: 'name', direction: 'asc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.productDeveloper;
  }

  findByChatId(chatId: string): Promise<ProductDeveloper | null> {
    return this.findOneWhere({ telegramChatId: chatId });
  }

  findByLinkCodeHash(codeHash: string): Promise<ProductDeveloper | null> {
    return this.findOneWhere({ telegramLinkCodeHash: codeHash });
  }

  findByTelegramUsername(username: string): Promise<ProductDeveloper | null> {
    return this.findOneWhere({ telegramUsername: { equals: username, mode: 'insensitive' } });
  }

  async findByIds(ids: readonly string[]): Promise<ProductDeveloper[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.db.productDeveloper.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findAllActive(): Promise<ProductDeveloper[]> {
    const rows = await this.prisma.db.productDeveloper.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }
}
