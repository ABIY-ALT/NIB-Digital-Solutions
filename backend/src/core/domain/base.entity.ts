import { BusinessRuleError } from './errors/app-error.js';

/**
 * Metadata every persisted entity carries.
 *   • identity                    → id
 *   • timestamps                  → createdAt / updatedAt
 *   • authorship                  → createdBy / updatedBy
 *   • optimistic concurrency      → version (incremented by the repository on save)
 *   • soft delete                 → deletedAt / deletedBy
 */
export interface EntityMetadata {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
  deletedAt: Date | null;
  deletedBy: string | null;
}

/** A fact that happened inside the domain. Collected on the entity, dispatched after commit. */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Base class for all domain entities. Contains no framework or ORM code
 * (principle 5): only identity, lifecycle and audit metadata.
 */
export abstract class BaseEntity {
  private _meta: EntityMetadata;
  private _events: DomainEvent[] = [];

  protected constructor(meta: EntityMetadata) {
    this._meta = { ...meta };
  }

  /** Metadata for a brand-new entity (version 1, not yet persisted). */
  protected static newMetadata(
    actorId: string | null,
    id: string = globalThis.crypto.randomUUID(),
  ): EntityMetadata {
    const now = new Date();
    return {
      id,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
      version: 1,
      deletedAt: null,
      deletedBy: null,
    };
  }

  get id(): string {
    return this._meta.id;
  }
  get createdAt(): Date {
    return this._meta.createdAt;
  }
  get updatedAt(): Date {
    return this._meta.updatedAt;
  }
  get createdBy(): string | null {
    return this._meta.createdBy;
  }
  get updatedBy(): string | null {
    return this._meta.updatedBy;
  }
  get version(): number {
    return this._meta.version;
  }
  get deletedAt(): Date | null {
    return this._meta.deletedAt;
  }
  get deletedBy(): string | null {
    return this._meta.deletedBy;
  }
  get isDeleted(): boolean {
    return this._meta.deletedAt !== null;
  }

  /** Snapshot of metadata for mappers. */
  get metadata(): Readonly<EntityMetadata> {
    return { ...this._meta };
  }

  /** Records who changed the entity. Call from every mutating domain method. */
  protected touch(actorId: string | null): void {
    this._meta.updatedAt = new Date();
    this._meta.updatedBy = actorId;
  }

  softDelete(actorId: string | null): void {
    if (this.isDeleted)
      throw new BusinessRuleError('The record is already deleted.', 'ALREADY_DELETED');
    this._meta.deletedAt = new Date();
    this._meta.deletedBy = actorId;
    this.touch(actorId);
  }

  restore(actorId: string | null): void {
    if (!this.isDeleted) throw new BusinessRuleError('The record is not deleted.', 'NOT_DELETED');
    this._meta.deletedAt = null;
    this._meta.deletedBy = null;
    this.touch(actorId);
  }

  /**
   * Asserts the caller edited the version it read (optimistic concurrency at the
   * domain boundary). The repository enforces it again atomically in SQL.
   */
  assertVersion(expected: number | undefined): boolean {
    return expected === undefined || expected === this._meta.version;
  }

  /** Called by repositories after a successful write. */
  syncPersistedMetadata(meta: Partial<EntityMetadata>): void {
    this._meta = { ...this._meta, ...meta };
  }

  protected addEvent(name: string, payload: Record<string, unknown> = {}): void {
    this._events.push({ name, occurredAt: new Date(), payload });
  }

  pullEvents(): DomainEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  equals(other: BaseEntity | null | undefined): boolean {
    return !!other && other.constructor === this.constructor && other.id === this.id;
  }
}
