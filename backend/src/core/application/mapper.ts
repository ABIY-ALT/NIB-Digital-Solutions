import { mapPage, type Page } from '#core/domain/pagination.js';

/**
 * Data always flows through mappers (principle 7):
 *
 *   DB record ──PersistenceMapper──▶ Domain entity ──ResponseMapper──▶ API DTO
 *
 * A database model or domain entity is never returned to an API caller directly.
 */
export abstract class PersistenceMapper<TDomain, TRecord, TWrite = TRecord> {
  abstract toDomain(record: TRecord): TDomain;
  abstract toPersistence(entity: TDomain): TWrite;

  toDomainList(records: readonly TRecord[]): TDomain[] {
    return records.map((r) => this.toDomain(r));
  }
}

export abstract class ResponseMapper<TDomain, TDto> {
  abstract toDto(entity: TDomain): TDto;

  toDtoList(entities: readonly TDomain[]): TDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toDtoPage(page: Page<TDomain>): Page<TDto> {
    return mapPage(page, (e) => this.toDto(e));
  }
}

/**
 * Convenience base for features that keep both directions in one class.
 * Prefer the two focused mappers above when the layers are owned separately.
 */
export abstract class BaseMapper<
  TDomain,
  TRecord,
  TDto,
  TWrite = TRecord,
> extends PersistenceMapper<TDomain, TRecord, TWrite> {
  abstract toDto(entity: TDomain): TDto;

  toDtoList(entities: readonly TDomain[]): TDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toDtoPage(page: Page<TDomain>): Page<TDto> {
    return mapPage(page, (e) => this.toDto(e));
  }
}
