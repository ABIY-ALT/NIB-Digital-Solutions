import { Injectable } from '@nestjs/common';
import type { ProductInquiry as ProductInquiryRecord, Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { ProductInquiry } from '../domain/product-inquiry.entity.js';
import { readNotes } from '#modules/marketplace/domain/lead-rules.js';
import type { ProductInquiryRepository } from '../domain/product-inquiry.repository.js';

type ProductInquiryWrite = Prisma.ProductInquiryUncheckedCreateInput;

class ProductInquiryMapper extends PersistenceMapper<
  ProductInquiry,
  ProductInquiryRecord,
  ProductInquiryWrite
> {
  toDomain(r: ProductInquiryRecord): ProductInquiry {
    return ProductInquiry.reconstitute(
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
        customerName: r.customerName,
        company: r.company,
        email: r.email,
        phone: r.phone,
        productSlug: r.productSlug,
        inquiryType: r.inquiryType,
        message: r.message,
        requirements: r.requirements,
        contactMethod: r.contactMethod,
        source: r.source,
        status: r.status,
        assignedTo: r.assignedTo,
        respondedAt: r.respondedAt,
        notes: readNotes(r.notes),
      },
    );
  }

  toPersistence(e: ProductInquiry): ProductInquiryWrite {
    const snapshot = e.toSnapshot();
    return {
      ...e.metadata,
      ...snapshot,
      notes: snapshot.notes as unknown as Prisma.InputJsonArray,
    };
  }
}

@Injectable()
export class PrismaProductInquiryRepository
  extends PrismaBaseRepository<ProductInquiry, ProductInquiryRecord, ProductInquiryWrite>
  implements ProductInquiryRepository
{
  protected readonly resourceName = 'ProductInquiry';
  protected readonly mapper = new ProductInquiryMapper();
  protected readonly querySpec: QuerySpec = {
    sortable: {
      reference: 'reference',
      customerName: 'customerName',
      company: 'company',
      email: 'email',
      phone: 'phone',
      productSlug: 'productSlug',
      inquiryType: 'inquiryType',
      contactMethod: 'contactMethod',
      source: 'source',
      status: 'status',
      assignedTo: 'assignedTo',
      respondedAt: 'respondedAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      reference: { column: 'reference', type: 'string' },
      customerName: { column: 'customerName', type: 'string' },
      company: { column: 'company', type: 'string' },
      email: { column: 'email', type: 'string' },
      phone: { column: 'phone', type: 'string' },
      productSlug: { column: 'productSlug', type: 'string' },
      inquiryType: { column: 'inquiryType', type: 'string' },
      contactMethod: { column: 'contactMethod', type: 'string' },
      source: { column: 'source', type: 'string' },
      status: { column: 'status', type: 'string' },
      // Received date: the lists' date filter and the staff home's 'waiting over 24 hours'.
      createdAt: { column: 'createdAt', type: 'date' },
      assignedTo: { column: 'assignedTo', type: 'string' },
      respondedAt: { column: 'respondedAt', type: 'date' },
    },
    searchable: [
      'reference',
      'customerName',
      'company',
      'email',
      'phone',
      'productSlug',
      'inquiryType',
      'message',
      'requirements',
      'contactMethod',
      'source',
      'status',
      'assignedTo',
    ],
    defaultSort: [{ field: 'reference', direction: 'asc' }],
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegate(db: DbClient): PrismaDelegate {
    return db.productInquiry;
  }

  findByUnique(field: 'reference', value: string | number): Promise<ProductInquiry | null> {
    return this.findOneWhere({ [field]: value }, { includeDeleted: true });
  }
}
