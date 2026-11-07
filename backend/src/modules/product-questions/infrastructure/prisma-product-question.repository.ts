import { Injectable } from '@nestjs/common';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import type {
  Prisma,
  ProductQuestion as ProductQuestionRecord,
  ProductQuestionMessage as MessageRecord,
} from '#generated/prisma/client.js';
import {
  ProductQuestion,
  type MessageAuthor,
  type MessageChannel,
  type QuestionMessage,
} from '../domain/product-question.entity.js';
import type {
  NewMessage,
  ProductQuestionRepository,
} from '../domain/product-question.repository.js';

type ProductQuestionWrite = Prisma.ProductQuestionUncheckedCreateInput;

class ProductQuestionMapper extends PersistenceMapper<
  ProductQuestion,
  ProductQuestionRecord,
  ProductQuestionWrite
> {
  toDomain(r: ProductQuestionRecord): ProductQuestion {
    return ProductQuestion.reconstitute(
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
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        question: r.question,
        status: r.status,
        developerId: r.developerId,
        lastMessageAt: r.lastMessageAt,
        accessTokenHash: r.accessTokenHash,
        ipHash: r.ipHash,
      },
    );
  }

  toPersistence(e: ProductQuestion): ProductQuestionWrite {
    return { ...e.metadata, ...e.toSnapshot() };
  }
}

const toMessage = (m: MessageRecord): QuestionMessage => ({
  id: m.id,
  author: m.author as MessageAuthor,
  authorName: m.authorName,
  developerId: m.developerId,
  channel: m.channel as MessageChannel,
  body: m.body,
  createdAt: m.createdAt,
});

@Injectable()
export class PrismaProductQuestionRepository
  extends PrismaBaseRepository<ProductQuestion, ProductQuestionRecord, ProductQuestionWrite>
  implements ProductQuestionRepository
{
  protected readonly resourceName = 'ProductQuestion';
  protected readonly mapper = new ProductQuestionMapper();
  // Customer contact details and secrets stay out of the audit diff values.
  protected override readonly auditDiff = {
    redact: ['customerEmail', 'accessTokenHash', 'ipHash'],
    ignore: ['lastMessageAt'],
  };
  protected readonly querySpec: QuerySpec = {
    sortable: {
      reference: 'reference',
      productSlug: 'productSlug',
      customerName: 'customerName',
      status: 'status',
      lastMessageAt: 'lastMessageAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      reference: { column: 'reference', type: 'string' },
      productSlug: { column: 'productSlug', type: 'string' },
      customerEmail: { column: 'customerEmail', type: 'string' },
      status: { column: 'status', type: 'string' },
      developerId: { column: 'developerId', type: 'uuid' },
    },
    searchable: ['reference', 'productSlug', 'customerName', 'customerEmail', 'question'],
    defaultSort: [{ field: 'lastMessageAt', direction: 'desc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.productQuestion;
  }

  findByUnique(field: 'reference', value: string | number): Promise<ProductQuestion | null> {
    return this.findOneWhere({ [field]: value }, { includeDeleted: true });
  }

  findByReference(reference: string): Promise<ProductQuestion | null> {
    return this.findOneWhere({ reference });
  }

  async addMessage(questionId: string, message: NewMessage): Promise<QuestionMessage> {
    const row = await this.prisma.db.productQuestionMessage.create({
      data: { questionId, ...message },
    });
    return toMessage(row);
  }

  async messages(questionId: string): Promise<QuestionMessage[]> {
    const rows = await this.prisma.db.productQuestionMessage.findMany({
      where: { questionId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map(toMessage);
  }

  countRecentByEmail(email: string, since: Date): Promise<number> {
    return this.prisma.db.productQuestion.count({
      where: { customerEmail: email, createdAt: { gte: since } },
    });
  }

  countRecentFromIp(ipHash: string, since: Date): Promise<number> {
    return this.prisma.db.productQuestion.count({ where: { ipHash, createdAt: { gte: since } } });
  }
}
