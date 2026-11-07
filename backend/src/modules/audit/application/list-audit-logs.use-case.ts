import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '#core/application/use-case.js';
import { NotFoundError } from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import {
  AUDIT_RECORD_REPOSITORY,
  type AuditActivitySummary,
  type AuditFacets,
  type AuditRecordRepository,
  type AuditRecordView,
} from './audit-record.repository.js';

@Injectable()
export class ListAuditLogsUseCase implements UseCase<PageRequest, Page<AuditRecordView>> {
  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly repository: AuditRecordRepository,
  ) {}

  execute(request: PageRequest): Promise<Page<AuditRecordView>> {
    return this.repository.findPage(request);
  }
}

@Injectable()
export class GetAuditLogUseCase implements UseCase<string, AuditRecordView> {
  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly repository: AuditRecordRepository,
  ) {}

  async execute(id: string): Promise<AuditRecordView> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError('AuditLog', id);
    return record;
  }
}

/** Activity figures for the audit dashboard strip, plus filter facets. */
@Injectable()
export class AuditActivityUseCase {
  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly repository: AuditRecordRepository,
  ) {}

  summary(from: Date | null, to: Date | null): Promise<AuditActivitySummary> {
    return this.repository.summary(from, to);
  }

  facets(): Promise<AuditFacets> {
    return this.repository.facets();
  }
}
