import { trackChange } from '#core/application/audit-changes.js';
import type { PersistenceMapper } from '#core/application/mapper.js';
import type { AuditSnapshot, DiffOptions } from '#core/domain/audit-change.js';
import type { BaseEntity, EntityMetadata } from '#core/domain/base.entity.js';
import { ConcurrencyError, NotFoundError, ValidationError } from '#core/domain/errors/app-error.js';
import {
  createPage,
  pageOffset,
  type FilterCondition,
  type Page,
  type PageRequest,
  type SortSpec,
} from '#core/domain/pagination.js';
import type { FindOptions, Repository } from '#core/domain/repository.js';
import { RequestContext } from '../context/request-context.js';
import { translatePrismaError } from './prisma-errors.js';
import type { DbClient, PrismaService } from './prisma.service.js';

/** Columns every base-entity table has. */
export interface BaseRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
  deletedAt: Date | null;
  deletedBy: string | null;
}

type Where = Record<string, unknown>;

/**
 * Minimal structural view of a Prisma model delegate. Prisma's generated
 * delegates are heavily generic; the base repository only needs these calls.
 */
export interface PrismaDelegate {
  findFirst(args: object): Promise<unknown>;
  findMany(args: object): Promise<unknown[]>;
  count(args: object): Promise<number>;
  create(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
  delete(args: object): Promise<unknown>;
}

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'uuid';

/** How API list parameters map onto this table. */
export interface QuerySpec {
  /** API sort field → Prisma orderBy key. */
  sortable: Record<string, string>;
  /** API filter field → { column, type }. */
  filterable: Record<string, { column: string; type: FieldType }>;
  /** Columns matched (case-insensitive contains) by `search`. */
  searchable: string[];
  defaultSort: SortSpec[];
}

/**
 * Generic Prisma repository implementing the base Repository contract:
 * find, save, update (optimistic concurrency), delete, soft delete, restore and
 * paginated listing with sort / filter / search.
 *
 * Subclasses provide the delegate, the mapper and the QuerySpec; relation writes
 * go in `afterSave` / `afterUpdate` hooks, which run inside the same transaction.
 *
 * Every write inside a request records a field-level before/after diff for the
 * audit trail (`auditSnapshot`); secrets are redacted automatically.
 */
export abstract class PrismaBaseRepository<
  TEntity extends BaseEntity,
  TRecord extends BaseRecord,
  TWrite extends object,
> implements Repository<TEntity> {
  protected abstract readonly resourceName: string;
  protected abstract readonly mapper: PersistenceMapper<TEntity, TRecord, TWrite>;
  protected abstract readonly querySpec: QuerySpec;
  /** Prisma `include` for loading relations the mapper needs. */
  protected readonly include: object | undefined = undefined;
  /** Record before/after values of writes in the audit trail. */
  protected readonly trackChanges: boolean = true;
  /** Extra fields to redact or leave out of the recorded changes. */
  protected readonly auditDiff: DiffOptions | undefined = undefined;

  protected constructor(protected readonly prisma: PrismaService) {}

  protected abstract delegate(db: DbClient): PrismaDelegate;

  protected get db(): DbClient {
    return this.prisma.db;
  }

  protected get model(): PrismaDelegate {
    return this.delegate(this.db);
  }

  /** Hook for row-level scoping applied to every read (e.g. tenant). */
  protected scopeWhere(): Where {
    return {};
  }

  protected notDeleted(options?: FindOptions): Where {
    return options?.includeDeleted ? {} : { deletedAt: null };
  }

  protected withInclude(args: Record<string, unknown>): Record<string, unknown> {
    return this.include ? { ...args, include: this.include } : args;
  }

  protected toDomain(record: unknown): TEntity {
    return this.mapper.toDomain(record as TRecord);
  }

  async findById(id: string, options?: FindOptions): Promise<TEntity | null> {
    const record = await this.model.findFirst(
      this.withInclude({ where: { id, ...this.notDeleted(options), ...this.scopeWhere() } }),
    );
    return record ? this.toDomain(record) : null;
  }

  async getById(id: string, options?: FindOptions): Promise<TEntity> {
    const entity = await this.findById(id, options);
    if (!entity) throw new NotFoundError(this.resourceName, id);
    return entity;
  }

  async exists(id: string, options?: FindOptions): Promise<boolean> {
    const count = await this.model.count({
      where: { id, ...this.notDeleted(options), ...this.scopeWhere() },
    });
    return count > 0;
  }

  async findOneWhere(where: Where, options?: FindOptions): Promise<TEntity | null> {
    const record = await this.model.findFirst(
      this.withInclude({ where: { ...where, ...this.notDeleted(options), ...this.scopeWhere() } }),
    );
    return record ? this.toDomain(record) : null;
  }

  /**
   * Paginated listing. `extraWhere` lets callers add authorization scope
   * constraints (e.g. branch = X) computed by the AuthorizationService.
   */
  async findPage(
    request: PageRequest,
    options?: FindOptions,
    extraWhere: Where = {},
  ): Promise<Page<TEntity>> {
    const where: Where = {
      AND: [
        this.notDeleted(options),
        this.scopeWhere(),
        extraWhere,
        this.buildFilterWhere(request.filters),
        this.buildSearchWhere(request.search),
      ],
    };
    const [records, total] = await Promise.all([
      this.model.findMany(
        this.withInclude({
          where,
          orderBy: this.buildOrderBy(request.sort),
          skip: pageOffset(request),
          take: request.pageSize,
        }),
      ),
      this.model.count({ where }),
    ]);
    return createPage(
      records.map((r) => this.toDomain(r)),
      total,
      request,
    );
  }

  async save(entity: TEntity): Promise<TEntity> {
    return this.prisma.transaction(async () => {
      try {
        const record = await this.model.create(
          this.withInclude({ data: this.mapper.toPersistence(entity) }),
        );
        await this.afterSave(entity);
        const saved = this.toDomain(record);
        entity.syncPersistedMetadata(saved.metadata);
        const reloaded = await this.afterSaveReload(entity);
        this.recordChange(entity.id, null, reloaded);
        return reloaded;
      } catch (error) {
        throw translatePrismaError(error);
      }
    });
  }

  async update(entity: TEntity): Promise<TEntity> {
    return this.prisma.transaction(async () => {
      try {
        const previous = this.tracking()
          ? await this.findById(entity.id, { includeDeleted: true })
          : null;
        const data = this.stripImmutable(this.mapper.toPersistence(entity));
        const result = await this.model.updateMany({
          where: { id: entity.id, version: entity.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (result.count === 0) {
          const stillExists = await this.model.count({ where: { id: entity.id } });
          if (stillExists === 0) throw new NotFoundError(this.resourceName, entity.id);
          throw new ConcurrencyError(this.resourceName, entity.id, entity.version);
        }
        await this.afterUpdate(entity);
        const reloaded = await this.findById(entity.id, { includeDeleted: true });
        if (!reloaded) throw new NotFoundError(this.resourceName, entity.id);
        if (previous) this.recordChange(entity.id, previous, reloaded);
        return reloaded;
      } catch (error) {
        throw translatePrismaError(error);
      }
    });
  }

  async softDelete(entity: TEntity, actorId: string | null): Promise<TEntity> {
    entity.softDelete(actorId);
    return this.update(entity);
  }

  async restore(entity: TEntity, actorId: string | null): Promise<TEntity> {
    entity.restore(actorId);
    return this.update(entity);
  }

  async delete(id: string): Promise<void> {
    try {
      const previous = this.tracking() ? await this.findById(id, { includeDeleted: true }) : null;
      await this.model.delete({ where: { id } });
      if (previous) this.recordChange(id, previous, null);
    } catch (error) {
      const translated = translatePrismaError(error);
      if (translated instanceof Error && 'code' in translated && translated.code === 'NOT_FOUND') {
        throw new NotFoundError(this.resourceName, id);
      }
      throw translated;
    }
  }

  // ── Change tracking ───────────────────────────────────────────────────────

  /**
   * The audited view of an entity: its persisted columns by default. Override
   * to add relations (e.g. permission codes) or to drop noisy fields.
   */
  protected auditSnapshot(entity: TEntity): AuditSnapshot {
    return { ...(this.mapper.toPersistence(entity) as Record<string, unknown>) };
  }

  private tracking(): boolean {
    return this.trackChanges && RequestContext.get() !== undefined;
  }

  private recordChange(id: string, before: TEntity | null, after: TEntity | null): void {
    if (!this.tracking()) return;
    trackChange(
      RequestContext.get(),
      {
        resourceType: this.resourceName,
        resourceId: id,
        before: before ? this.auditSnapshot(before) : null,
        after: after ? this.auditSnapshot(after) : null,
      },
      this.auditDiff,
    );
  }

  // ── Hooks ─────────────────────────────────────────────────────────────────

  /** Write relations after insert (same transaction). */
  protected async afterSave(_entity: TEntity): Promise<void> {
    // No relations by default: repositories of aggregates with relations override this.
  }

  /** Write relations after update (same transaction). */
  protected async afterUpdate(_entity: TEntity): Promise<void> {
    // No relations by default: repositories of aggregates with relations override this.
  }

  /** Reload after insert so relations are hydrated. */
  protected async afterSaveReload(entity: TEntity): Promise<TEntity> {
    return (await this.findById(entity.id, { includeDeleted: true })) ?? entity;
  }

  // ── Query building ────────────────────────────────────────────────────────

  private stripImmutable(data: TWrite): Record<string, unknown> {
    const immutable: Array<keyof EntityMetadata> = ['id', 'createdAt', 'createdBy', 'version'];
    const copy = { ...(data as Record<string, unknown>) };
    for (const key of immutable) delete copy[key];
    return copy;
  }

  protected buildOrderBy(sort: SortSpec[]): Array<Record<string, 'asc' | 'desc'>> {
    const specs = sort.length > 0 ? sort : this.querySpec.defaultSort;
    const orderBy = specs.map((s) => {
      const column = this.querySpec.sortable[s.field];
      if (!column)
        throw new ValidationError([{ field: 'sort', message: `Cannot sort by "${s.field}"` }]);
      return { [column]: s.direction };
    });
    // Stable ordering for deterministic pagination.
    if (!specs.some((s) => this.querySpec.sortable[s.field] === 'id')) orderBy.push({ id: 'asc' });
    return orderBy;
  }

  protected buildSearchWhere(search?: string): Where {
    const term = search?.trim();
    if (!term || this.querySpec.searchable.length === 0) return {};
    return {
      OR: this.querySpec.searchable.map((column) => ({
        [column]: { contains: term, mode: 'insensitive' },
      })),
    };
  }

  protected buildFilterWhere(filters: FilterCondition[]): Where {
    const clauses = filters.map((f) => {
      const spec = this.querySpec.filterable[f.field];
      if (!spec)
        throw new ValidationError([
          { field: `filter[${f.field}]`, message: 'Unknown filter field' },
        ]);
      const coerce = (v: string): unknown => this.coerce(v, spec.type, f.field);
      const values = Array.isArray(f.value) ? f.value : [f.value];
      const first = coerce(values[0] ?? '');
      switch (f.operator) {
        case 'eq':
          return { [spec.column]: first };
        case 'ne':
          return { [spec.column]: { not: first } };
        case 'in':
          return { [spec.column]: { in: values.map(coerce) } };
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
          return { [spec.column]: { [f.operator]: first } };
        case 'contains':
          if (spec.type !== 'string')
            throw new ValidationError([
              { field: `filter[${f.field}]`, message: 'contains is only supported on text fields' },
            ]);
          return { [spec.column]: { contains: String(first), mode: 'insensitive' } };
        default:
          return {};
      }
    });
    return clauses.length > 0 ? { AND: clauses } : {};
  }

  private coerce(value: string, type: FieldType, field: string): unknown {
    const invalid = (): never => {
      throw new ValidationError([{ field: `filter[${field}]`, message: `Invalid ${type} value` }]);
    };
    switch (type) {
      case 'number': {
        const n = Number(value);
        return Number.isFinite(n) ? n : invalid();
      }
      case 'boolean':
        if (value !== 'true' && value !== 'false') return invalid();
        return value === 'true';
      case 'date': {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? invalid() : d;
      }
      case 'uuid':
        // Reject malformed ids before they reach a uuid column (would otherwise be a DB error).
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
          ? value
          : invalid();
      default:
        return value;
    }
  }
}
