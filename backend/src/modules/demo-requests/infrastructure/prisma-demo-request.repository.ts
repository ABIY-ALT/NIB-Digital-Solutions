import { Injectable } from '@nestjs/common';
import type { DemoRequest as DemoRequestRecord, Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import {
  PrismaBaseRepository,
  type PrismaDelegate,
  type QuerySpec,
} from '#core/infrastructure/prisma/prisma-base.repository.js';
import { PrismaService, type DbClient } from '#core/infrastructure/prisma/prisma.service.js';
import { DemoRequest } from '../domain/demo-request.entity.js';
import { readNotes } from '#modules/marketplace/domain/lead-rules.js';
import type { DemoRequestRepository } from '../domain/demo-request.repository.js';

type DemoRequestWrite = Prisma.DemoRequestUncheckedCreateInput;

class DemoRequestMapper extends PersistenceMapper<
  DemoRequest,
  DemoRequestRecord,
  DemoRequestWrite
> {
  toDomain(r: DemoRequestRecord): DemoRequest {
    return DemoRequest.reconstitute(
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
        fullName: r.fullName,
        organization: r.organization,
        jobTitle: r.jobTitle,
        email: r.email,
        phone: r.phone,
        productSlug: r.productSlug,
        demoType: r.demoType,
        preferredDate: r.preferredDate,
        preferredTime: r.preferredTime,
        requirements: r.requirements,
        source: r.source,
        status: r.status,
        assignedTo: r.assignedTo,
        followUpDate: r.followUpDate,
        notes: readNotes(r.notes),
      },
    );
  }

  toPersistence(e: DemoRequest): DemoRequestWrite {
    const snapshot = e.toSnapshot();
    return {
      ...e.metadata,
      ...snapshot,
      notes: snapshot.notes as unknown as Prisma.InputJsonArray,
    };
  }
}

@Injectable()
export class PrismaDemoRequestRepository
  extends PrismaBaseRepository<DemoRequest, DemoRequestRecord, DemoRequestWrite>
  implements DemoRequestRepository
{
  protected readonly resourceName = 'DemoRequest';
  protected readonly mapper = new DemoRequestMapper();
  protected readonly querySpec: QuerySpec = {
    sortable: {
      reference: 'reference',
      fullName: 'fullName',
      organization: 'organization',
      jobTitle: 'jobTitle',
      email: 'email',
      phone: 'phone',
      productSlug: 'productSlug',
      demoType: 'demoType',
      preferredDate: 'preferredDate',
      preferredTime: 'preferredTime',
      source: 'source',
      status: 'status',
      assignedTo: 'assignedTo',
      followUpDate: 'followUpDate',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    filterable: {
      id: { column: 'id', type: 'uuid' },
      reference: { column: 'reference', type: 'string' },
      fullName: { column: 'fullName', type: 'string' },
      organization: { column: 'organization', type: 'string' },
      jobTitle: { column: 'jobTitle', type: 'string' },
      email: { column: 'email', type: 'string' },
      phone: { column: 'phone', type: 'string' },
      productSlug: { column: 'productSlug', type: 'string' },
      demoType: { column: 'demoType', type: 'string' },
      preferredDate: { column: 'preferredDate', type: 'date' },
      preferredTime: { column: 'preferredTime', type: 'string' },
      source: { column: 'source', type: 'string' },
      status: { column: 'status', type: 'string' },
      // Received date: the lists' date filter and the staff home's 'waiting over 24 hours'.
      createdAt: { column: 'createdAt', type: 'date' },
      assignedTo: { column: 'assignedTo', type: 'string' },
      followUpDate: { column: 'followUpDate', type: 'date' },
    },
    searchable: [
      'reference',
      'fullName',
      'organization',
      'jobTitle',
      'email',
      'phone',
      'productSlug',
      'demoType',
      'preferredTime',
      'requirements',
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
    return db.demoRequest;
  }

  findByUnique(field: 'reference', value: string | number): Promise<DemoRequest | null> {
    return this.findOneWhere({ [field]: value }, { includeDeleted: true });
  }
}
