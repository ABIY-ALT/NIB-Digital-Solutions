import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PORT, type CachePort } from '#core/application/ports/cache.port.js';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import {
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import {
  ReferenceDataItem,
  ReferenceDataType,
  type AttributeDefinition,
  type AttributeValue,
  type ItemInput,
} from '../domain/reference-data.js';
import {
  REFERENCE_DATA_ITEMS,
  REFERENCE_DATA_TYPES,
  type ReferenceDataItemRepository,
  type ReferenceDataTypeRepository,
} from '../domain/reference-data.repository.js';

const CACHE_PREFIX = 'refdata:';
const LOOKUP_TTL_SECONDS = 300;

export interface LookupOption {
  code: string;
  label: string;
  description: string | null;
  parentCode: string | null;
  attributes: Record<string, AttributeValue>;
  active: boolean;
}

export interface TypeInput {
  code?: string;
  name?: string;
  description?: string | null;
  attributes?: AttributeDefinition[];
  parentTypeCode?: string | null;
}

/**
 * Reference data administration and the cached lookup API. Every write
 * invalidates the lookup cache, so dropdowns reflect changes within seconds
 * (instantly on this instance).
 */
@Injectable()
export class ReferenceDataUseCases {
  constructor(
    @Inject(REFERENCE_DATA_TYPES) private readonly types: ReferenceDataTypeRepository,
    @Inject(REFERENCE_DATA_ITEMS) private readonly items: ReferenceDataItemRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  // ── Types ─────────────────────────────────────────────────────────────────

  listTypes(request: PageRequest): Promise<Page<ReferenceDataType>> {
    return this.types.findPage(request);
  }

  async getType(code: string): Promise<ReferenceDataType> {
    const type = await this.types.findByCode(code);
    if (!type) throw new NotFoundError('ReferenceDataType', code);
    return type;
  }

  async createType(principal: Principal, input: TypeInput & { code: string; name: string }) {
    return this.tx.run(async () => {
      if (await this.types.findByCode(input.code, { includeDeleted: true })) {
        throw new ConflictError('A list with this code already exists.', { field: 'code' });
      }
      await this.assertParent(input.parentTypeCode);
      const created = await this.types.save(ReferenceDataType.create(input, principal.userId));
      await this.invalidate();
      return created;
    });
  }

  async updateType(principal: Principal, code: string, version: number, input: TypeInput) {
    return this.tx.run(async () => {
      const type = await this.getType(code);
      if (!type.assertVersion(version))
        throw new ConcurrencyError('ReferenceDataType', type.id, version);
      await this.assertParent(input.parentTypeCode);
      type.update(input, principal.userId);
      const saved = await this.types.update(type);
      await this.invalidate();
      return saved;
    });
  }

  async deleteType(principal: Principal, code: string) {
    const type = await this.getType(code);
    const deleted = await this.types.softDelete(type, principal.userId);
    await this.invalidate();
    return deleted;
  }

  private async assertParent(parentTypeCode: string | null | undefined): Promise<void> {
    if (parentTypeCode && !(await this.types.findByCode(parentTypeCode))) {
      throw new ValidationError([{ field: 'parentTypeCode', message: 'Unknown parent list' }]);
    }
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  async listItems(typeCode: string, request: PageRequest) {
    const type = await this.getType(typeCode);
    return { type, page: await this.items.findPageForType(type.id, request) };
  }

  getItem(id: string): Promise<ReferenceDataItem> {
    return this.items.getById(id);
  }

  async typeOfItem(item: ReferenceDataItem): Promise<ReferenceDataType> {
    return this.getType(item.typeCode);
  }

  /** Validates a new item without saving it (maker–checker preview). */
  async draftItem(
    principal: Principal,
    typeCode: string,
    input: ItemInput & { code: string; label: string },
  ): Promise<ReferenceDataItem> {
    const type = await this.getType(typeCode);
    const existing = await this.items.findByCode(type.id, input.code, { includeDeleted: true });
    if (existing) {
      throw new ConflictError(
        existing.isDeleted
          ? 'This code was used by a deleted item; codes are never reused.'
          : 'An item with this code already exists in the list.',
        { field: 'code' },
      );
    }
    await this.assertParentItem(type, input.parentCode);
    return ReferenceDataItem.create(type, input, principal.userId);
  }

  async createItem(
    principal: Principal,
    typeCode: string,
    input: ItemInput & { code: string; label: string },
  ): Promise<ReferenceDataItem> {
    return this.tx.run(async () => {
      const item = await this.items.save(await this.draftItem(principal, typeCode, input));
      await this.invalidate();
      return item;
    });
  }

  /** Applies changes to a loaded item (validation only; not saved). */
  async applyItemChanges(
    principal: Principal,
    item: ReferenceDataItem,
    version: number,
    changes: ItemInput,
  ): Promise<ReferenceDataItem> {
    if (!item.assertVersion(version))
      throw new ConcurrencyError('ReferenceDataItem', item.id, version);
    const type = await this.typeOfItem(item);
    await this.assertParentItem(type, changes.parentCode);
    item.update(type, changes, principal.userId);
    return item;
  }

  async updateItem(principal: Principal, id: string, version: number, changes: ItemInput) {
    return this.tx.run(async () => {
      const item = await this.items.getById(id);
      await this.applyItemChanges(principal, item, version, changes);
      const saved = await this.items.update(item);
      await this.invalidate();
      return saved;
    });
  }

  async deleteItem(principal: Principal, id: string) {
    const item = await this.items.getById(id);
    const deleted = await this.items.softDelete(item, principal.userId);
    await this.invalidate();
    return deleted;
  }

  private async assertParentItem(
    type: ReferenceDataType,
    parentCode: string | null | undefined,
  ): Promise<void> {
    if (!parentCode || !type.parentTypeCode) return;
    const parentType = await this.getType(type.parentTypeCode);
    if (!(await this.items.findByCode(parentType.id, parentCode))) {
      throw new ValidationError([
        { field: 'parentCode', message: `Unknown ${parentType.name} code "${parentCode}"` },
      ]);
    }
  }

  // ── Lookup (dropdowns) ────────────────────────────────────────────────────

  /**
   * Options for a list in the reader's language. Effective items only (active
   * and inside their validity window) unless `includeInactive`; optionally
   * filtered by parent (e.g. branches of one region).
   */
  async lookup(
    typeCode: string,
    options: { locale?: string; parentCode?: string; includeInactive?: boolean } = {},
  ): Promise<LookupOption[]> {
    const key = `${CACHE_PREFIX}${typeCode}:${options.locale ?? '-'}:${options.includeInactive ? 'all' : 'effective'}`;
    const all = await this.cache.wrap(key, LOOKUP_TTL_SECONDS, async () => {
      const type = await this.getType(typeCode);
      const now = new Date();
      return (await this.items.findAllForType(type.id))
        .filter((i) => options.includeInactive || i.isEffective(now))
        .map<LookupOption>((i) => ({
          code: i.code,
          label: i.labelFor(options.locale),
          description: i.description,
          parentCode: i.parentCode,
          attributes: { ...i.attributes },
          active: i.isEffective(now),
        }));
    });
    const parent = options.parentCode?.toUpperCase();
    return parent ? all.filter((o) => o.parentCode === parent) : all;
  }

  private invalidate(): Promise<void> {
    return this.cache.deleteByPrefix(CACHE_PREFIX);
  }
}
