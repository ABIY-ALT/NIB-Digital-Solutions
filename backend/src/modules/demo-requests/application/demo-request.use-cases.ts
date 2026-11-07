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
import { DemoRequest, type DemoRequestInput } from '../domain/demo-request.entity.js';
import {
  DEMO_REQUEST_REPOSITORY,
  type DemoRequestRepository,
} from '../domain/demo-request.repository.js';

/** Demo requests: one use case per operation (generated). */

/** The fields of a lead the assignment notice needs. */
const assignedLead = (e: DemoRequest) => ({
  id: e.id,
  reference: e.reference,
  name: e.fullName,
  organization: e.organization ?? null,
  productSlug: e.productSlug ?? null,
  assignedTo: e.assignedTo ?? null,
});

@Injectable()
export class ListDemoRequestsUseCase implements UseCase<PageRequest, Page<DemoRequest>> {
  constructor(@Inject(DEMO_REQUEST_REPOSITORY) private readonly repo: DemoRequestRepository) {}

  execute(request: PageRequest): Promise<Page<DemoRequest>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetDemoRequestUseCase implements UseCase<string, DemoRequest> {
  constructor(@Inject(DEMO_REQUEST_REPOSITORY) private readonly repo: DemoRequestRepository) {}

  execute(id: string): Promise<DemoRequest> {
    return this.repo.getById(id);
  }
}

export interface CreateDemoRequestCommand extends DemoRequestInput {
  principal: Principal;
}

@Injectable()
export class CreateDemoRequestUseCase implements UseCase<CreateDemoRequestCommand, DemoRequest> {
  constructor(
    @Inject(DEMO_REQUEST_REPOSITORY) private readonly repo: DemoRequestRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /** Validates without saving (used by the maker–checker preview). */
  async draft({ principal, ...input }: CreateDemoRequestCommand): Promise<DemoRequest> {
    if (input.reference !== undefined && input.reference !== null) {
      const other = await this.repo.findByUnique('reference', input.reference);
      if (other && other.id !== '') {
        throw new ConflictError('Reference is already used.', { field: 'reference' });
      }
    }
    if (input.assignedTo) await assertAssignable(this.users, input.assignedTo, 'demo');
    return DemoRequest.create(input, principal.userId);
  }

  async execute(command: CreateDemoRequestCommand): Promise<DemoRequest> {
    const saved = await this.tx.run(async () => this.repo.save(await this.draft(command)));
    await publishIfReassigned(
      this.events,
      'demo',
      assignedLead(saved),
      null,
      command.principal.userId,
    );
    return saved;
  }
}

export interface UpdateDemoRequestCommand extends Partial<DemoRequestInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateDemoRequestUseCase implements UseCase<UpdateDemoRequestCommand, DemoRequest> {
  constructor(
    @Inject(DEMO_REQUEST_REPOSITORY) private readonly repo: DemoRequestRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply(command: UpdateDemoRequestCommand): Promise<DemoRequest> {
    return (await this.prepare(command)).entity;
  }

  private async prepare({
    principal,
    id,
    version,
    ...input
  }: UpdateDemoRequestCommand): Promise<{ entity: DemoRequest; previousAssignee: string | null }> {
    const entity = await this.repo.getById(id);
    const previousAssignee = entity.assignedTo ?? null;
    if (!entity.assertVersion(version)) throw new ConcurrencyError('DemoRequest', id, version);
    if (input.reference !== undefined && input.reference !== null) {
      const other = await this.repo.findByUnique('reference', input.reference);
      if (other && other.id !== id) {
        throw new ConflictError('Reference is already used.', { field: 'reference' });
      }
    }
    if (input.assignedTo && input.assignedTo !== previousAssignee) {
      await assertAssignable(this.users, input.assignedTo, 'demo');
    }
    entity.update(input, principal.userId);
    return { entity, previousAssignee };
  }

  async execute(command: UpdateDemoRequestCommand): Promise<DemoRequest> {
    const { saved, previousAssignee } = await this.tx.run(async () => {
      const { entity, previousAssignee } = await this.prepare(command);
      return { saved: await this.repo.update(entity), previousAssignee };
    });
    await publishIfReassigned(
      this.events,
      'demo',
      assignedLead(saved),
      previousAssignee,
      command.principal.userId,
    );
    return saved;
  }
}

@Injectable()
export class DeleteDemoRequestUseCase implements UseCase<
  { principal: Principal; id: string },
  DemoRequest
> {
  constructor(@Inject(DEMO_REQUEST_REPOSITORY) private readonly repo: DemoRequestRepository) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<DemoRequest> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}

// ── Marketplace (hand-written) ──────────────────────────────────────────────

/** What a website visitor submits (reference, status and ownership are set here). */
export type DemoRequestSubmission = Omit<
  DemoRequestInput,
  'reference' | 'status' | 'assignedTo' | 'followUpDate' | 'notes'
>;

/** Public submission from the marketplace website: new reference, status "new", event for notifications. */
@Injectable()
export class SubmitDemoRequestUseCase implements UseCase<DemoRequestSubmission, DemoRequest> {
  constructor(
    @Inject(DEMO_REQUEST_REPOSITORY) private readonly repo: DemoRequestRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async execute(input: DemoRequestSubmission): Promise<DemoRequest> {
    const saved = await this.tx.run(() =>
      this.repo.save(
        DemoRequest.create({ ...input, reference: makeReference('DEMO'), status: 'new' }, null),
      ),
    );
    await this.events.publish<LeadSubmittedEvent>({
      name: MarketplaceEvents.DemoRequested,
      payload: {
        kind: 'demo',
        id: saved.id,
        reference: saved.reference,
        name: saved.fullName,
        organization: saved.organization,
        productSlug: saved.productSlug,
        type: saved.demoType,
        email: saved.email,
        preferredDate: saved.preferredDate?.toISOString().slice(0, 10) ?? null,
        preferredTime: saved.preferredTime ?? null,
        contactMethod: null,
      },
    });
    return saved;
  }
}

/** Appends an internal note to a demo request (author = the signed-in staff member). */
@Injectable()
export class AddDemoRequestNoteUseCase implements UseCase<
  { principal: Principal; id: string; body: string },
  DemoRequest
> {
  constructor(
    @Inject(DEMO_REQUEST_REPOSITORY) private readonly repo: DemoRequestRepository,
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
  }): Promise<DemoRequest> {
    return this.tx.run(async () => {
      const entity = await this.repo.getById(id);
      entity.addNote(principal.username, body, principal.userId);
      return this.repo.update(entity);
    });
  }
}
