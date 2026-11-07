import type { BaseEntity } from './base.entity.js';
import type { Page, PageRequest } from './pagination.js';

export interface FindOptions {
  /** Include soft-deleted rows. Defaults to false. */
  includeDeleted?: boolean;
}

/**
 * Base repository contract. Business logic depends on this interface only; the
 * infrastructure layer supplies a Prisma (or any other) implementation.
 */
export interface Repository<TEntity extends BaseEntity> {
  findById(id: string, options?: FindOptions): Promise<TEntity | null>;
  /** Throws NotFoundError when missing. */
  getById(id: string, options?: FindOptions): Promise<TEntity>;
  exists(id: string, options?: FindOptions): Promise<boolean>;
  findPage(request: PageRequest, options?: FindOptions): Promise<Page<TEntity>>;
  /** Inserts a new entity. */
  save(entity: TEntity): Promise<TEntity>;
  /** Updates an entity; fails with ConcurrencyError when its version is stale. */
  update(entity: TEntity): Promise<TEntity>;
  /** Marks the entity deleted (sets deletedAt/deletedBy) through `update`. */
  softDelete(entity: TEntity, actorId: string | null): Promise<TEntity>;
  /** Clears the soft-delete markers through `update`. */
  restore(entity: TEntity, actorId: string | null): Promise<TEntity>;
  /** Physically removes the row. Prefer softDelete for business data. */
  delete(id: string): Promise<void>;
}
