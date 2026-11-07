import type { FindOptions, Repository } from '#core/domain/repository.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import type { ReferenceDataItem, ReferenceDataType } from './reference-data.js';

export interface ReferenceDataTypeRepository extends Repository<ReferenceDataType> {
  findByCode(code: string, options?: FindOptions): Promise<ReferenceDataType | null>;
}

export interface ReferenceDataItemRepository extends Repository<ReferenceDataItem> {
  findByCode(
    typeId: string,
    code: string,
    options?: FindOptions,
  ): Promise<ReferenceDataItem | null>;
  findPageForType(typeId: string, request: PageRequest): Promise<Page<ReferenceDataItem>>;
  /** Every item of a type (lookups), ordered by sortOrder then label. */
  findAllForType(typeId: string): Promise<ReferenceDataItem[]>;
}

export const REFERENCE_DATA_TYPES = Symbol('ReferenceDataTypeRepository');
export const REFERENCE_DATA_ITEMS = Symbol('ReferenceDataItemRepository');
