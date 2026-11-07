import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import { EVENT_BUS, type EventBus } from '#core/application/ports/event-bus.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { ConcurrencyError, ConflictError } from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import {
  assertAssignable,
  publishIfReassigned,
} from '#modules/marketplace/application/lead-assignment.js';
import { makeReference } from '#modules/marketplace/domain/lead-rules.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import {
  MarketplaceEvents,
  type LeadSubmittedEvent,
} from '#modules/marketplace/domain/marketplace.constants.js';
import { ProductInquiry, type ProductInquiryInput } from '../domain/product-inquiry.entity.js';
import {
  PRODUCT_INQUIRY_REPOSITORY,
  type ProductInquiryRepository,
} from '../domain/product-inquiry.repository.js';

/** Product inquiries: one use case per operation (generated). */

/** The fields of a lead the assignment notice needs. */
const assignedLead = (e: ProductInquiry) => ({
  id: e.id,
  reference: e.reference,
  name: e.customerName,
  organization: e.company ?? null,
  productSlug: e.productSlug ?? null,
  assignedTo: e.assignedTo ?? null,
});

@Injectable()
export class ListProductInquiriesUseCase implements UseCase<PageRequest, Page<ProductInquiry>> {
  constructor(
    @Inject(PRODUCT_INQUIRY_REPOSITORY) private readonly repo: ProductInquiryRepository,
  ) {}

  execute(request: PageRequest): Promise<Page<ProductInquiry>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetProductInquiryUseCase implements UseCase<string, ProductInquiry> {
  constructor(
    @Inject(PRODUCT_INQUIRY_REPOSITORY) private readonly repo: ProductInquiryRepository,
  ) {}

  execute(id: string): Promise<ProductInquiry> {
    return this.repo.getById(id);
  }
}

export interface CreateProductInquiryCommand extends ProductInquiryInput {
  principal: Principal;
}

@Injectable()
export class CreateProductInquiryUseCase implements UseCase<
  CreateProductInquiryCommand,
  ProductInquiry
> {
  constructor(
    @Inject(PRODUCT_INQUIRY_REPOSITORY) private readonly repo: ProductInquiryRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /** Validates without saving (used by the maker–checker preview). */
  async draft({ principal, ...input }: CreateProductInquiryCommand): Promise<ProductInquiry> {
    if (input.reference !== undefined && input.reference !== null) {
      const other = await this.repo.findByUnique('reference', input.reference);
      if (other && other.id !== '') {
        throw new ConflictError('Reference is already used.', { field: 'reference' });
      }
    }
    if (input.assignedTo) await assertAssignable(this.users, input.assignedTo, 'inquiry');
    return ProductInquiry.create(input, principal.userId);
  }

  async execute(command: CreateProductInquiryCommand): Promise<ProductInquiry> {
    const saved = await this.tx.run(async () => this.repo.save(await this.draft(command)));
    await publishIfReassigned(
      this.events,
      'inquiry',
      assignedLead(saved),
      null,
      command.principal.userId,
    );
    return saved;
  }
}

export interface UpdateProductInquiryCommand extends Partial<ProductInquiryInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateProductInquiryUseCase implements UseCase<
  UpdateProductInquiryCommand,
  ProductInquiry
> {
  constructor(
    @Inject(PRODUCT_INQUIRY_REPOSITORY) private readonly repo: ProductInquiryRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply(command: UpdateProductInquiryCommand): Promise<ProductInquiry> {
    return (await this.prepare(command)).entity;
  }

  private async prepare({
    principal,
    id,
    version,
    ...input
  }: UpdateProductInquiryCommand): Promise<{
    entity: ProductInquiry;
    previousAssignee: string | null;
  }> {
    const entity = await this.repo.getById(id);
    const previousAssignee = entity.assignedTo ?? null;
    if (!entity.assertVersion(version)) throw new ConcurrencyError('ProductInquiry', id, version);
    if (input.reference !== undefined && input.reference !== null) {
      const other = await this.repo.findByUnique('reference', input.reference);
      if (other && other.id !== id) {
        throw new ConflictError('Reference is already used.', { field: 'reference' });
      }
    }
    if (input.assignedTo && input.assignedTo !== previousAssignee) {
      await assertAssignable(this.users, input.assignedTo, 'inquiry');
    }
    entity.update(input, principal.userId);
    return { entity, previousAssignee };
  }

  async execute(command: UpdateProductInquiryCommand): Promise<ProductInquiry> {
    const { saved, previousAssignee } = await this.tx.run(async () => {
      const { entity, previousAssignee } = await this.prepare(command);
      return { saved: await this.repo.update(entity), previousAssignee };
    });
    await publishIfReassigned(
      this.events,
      'inquiry',
      assignedLead(saved),
      previousAssignee,
      command.principal.userId,
    );
    return saved;
  }
}

@Injectable()
export class DeleteProductInquiryUseCase implements UseCase<
  { principal: Principal; id: string },
  ProductInquiry
> {
  constructor(
    @Inject(PRODUCT_INQUIRY_REPOSITORY) private readonly repo: ProductInquiryRepository,
  ) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<ProductInquiry> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}

// ── Marketplace (hand-written) ──────────────────────────────────────────────

/** What a website visitor submits (reference, status and ownership are set here). */
export type ProductInquirySubmission = Omit<
  ProductInquiryInput,
  'reference' | 'status' | 'assignedTo' | 'respondedAt' | 'notes'
>;

/** Public submission from the marketplace website: new reference, status "new", event for notifications. */
@Injectable()
export class SubmitProductInquiryUseCase implements UseCase<
  ProductInquirySubmission,
  ProductInquiry
> {
  constructor(
    @Inject(PRODUCT_INQUIRY_REPOSITORY) private readonly repo: ProductInquiryRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async execute(input: ProductInquirySubmission): Promise<ProductInquiry> {
    const saved = await this.tx.run(() =>
      this.repo.save(
        ProductInquiry.create({ ...input, reference: makeReference('INQ'), status: 'new' }, null),
      ),
    );
    await this.events.publish<LeadSubmittedEvent>({
      name: MarketplaceEvents.InquiryReceived,
      payload: {
        kind: 'inquiry',
        id: saved.id,
        reference: saved.reference,
        name: saved.customerName,
        organization: saved.company,
        productSlug: saved.productSlug,
        type: saved.inquiryType,
        email: saved.email,
        preferredDate: null,
        preferredTime: null,
        contactMethod: saved.contactMethod,
      },
    });
    return saved;
  }
}

/** Appends an internal note to an inquiry (author = the signed-in staff member). */
@Injectable()
export class AddProductInquiryNoteUseCase implements UseCase<
  { principal: Principal; id: string; body: string },
  ProductInquiry
> {
  constructor(
    @Inject(PRODUCT_INQUIRY_REPOSITORY) private readonly repo: ProductInquiryRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  execute({
    principal,
    id,
    body,
  }: {
    principal: Principal;
    id: string;
    body: string;
  }): Promise<ProductInquiry> {
    return this.tx.run(async () => {
      const entity = await this.repo.getById(id);
      entity.addNote(principal.username, body, principal.userId);
      return this.repo.update(entity);
    });
  }
}
