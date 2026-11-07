import { Module } from '@nestjs/common';
import { ReferenceDataApprovalHandlers } from './application/reference-data-approval.handlers.js';
import { ReferenceDataOptionSource } from './application/reference-data-option.source.js';
import { ReferenceDataUseCases } from './application/reference-data.use-cases.js';
import { REFERENCE_DATA_ITEMS, REFERENCE_DATA_TYPES } from './domain/reference-data.repository.js';
import {
  PrismaReferenceDataItemRepository,
  PrismaReferenceDataTypeRepository,
} from './infrastructure/prisma-reference-data.repository.js';
import { ReferenceDataController } from './presentation/reference-data.controller.js';

/**
 * Reference data (lookups): typed code lists with custom attributes,
 * translations, validity dates and parent/child lists, plus a cached lookup
 * API for dropdowns. Item changes can be put under maker–checker control.
 */
@Module({
  controllers: [ReferenceDataController],
  providers: [
    { provide: REFERENCE_DATA_TYPES, useClass: PrismaReferenceDataTypeRepository },
    { provide: REFERENCE_DATA_ITEMS, useClass: PrismaReferenceDataItemRepository },
    ReferenceDataUseCases,
    ReferenceDataApprovalHandlers,
    ReferenceDataOptionSource,
  ],
  exports: [ReferenceDataUseCases],
})
export class ReferenceDataModule {}
