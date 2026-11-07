import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import {
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from '#core/domain/errors/app-error.js';
import { makeReference } from '#modules/marketplace/domain/lead-rules.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import { ProductIdea, type ProductIdeaInput } from '../domain/product-idea.entity.js';
import {
  PRODUCT_IDEA_REPOSITORY,
  type ProductIdeaRepository,
  type PublicIdeaQuery,
  type VoteOutcome,
} from '../domain/product-idea.repository.js';

/** Product ideas: one use case per operation (generated). */

@Injectable()
export class ListProductIdeasUseCase implements UseCase<PageRequest, Page<ProductIdea>> {
  constructor(@Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository) {}

  execute(request: PageRequest): Promise<Page<ProductIdea>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetProductIdeaUseCase implements UseCase<string, ProductIdea> {
  constructor(@Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository) {}

  execute(id: string): Promise<ProductIdea> {
    return this.repo.getById(id);
  }
}

export interface CreateProductIdeaCommand extends ProductIdeaInput {
  principal: Principal;
}

@Injectable()
export class CreateProductIdeaUseCase implements UseCase<CreateProductIdeaCommand, ProductIdea> {
  constructor(
    @Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Validates without saving (used by the maker–checker preview). */
  async draft({ principal, ...input }: CreateProductIdeaCommand): Promise<ProductIdea> {
    input.reference = input.reference || makeReference('IDEA');
    {
      const other = await this.repo.findByUnique('reference', input.reference);
      if (other && other.id !== '') {
        throw new ConflictError('Reference is already used.', { field: 'reference' });
      }
    }
    return ProductIdea.create(input, principal.userId);
  }

  execute(command: CreateProductIdeaCommand): Promise<ProductIdea> {
    return this.tx.run(async () => this.repo.save(await this.draft(command)));
  }
}

export interface UpdateProductIdeaCommand extends Partial<ProductIdeaInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateProductIdeaUseCase implements UseCase<UpdateProductIdeaCommand, ProductIdea> {
  constructor(
    @Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply({
    principal,
    id,
    version,
    ...input
  }: UpdateProductIdeaCommand): Promise<ProductIdea> {
    const entity = await this.repo.getById(id);
    if (!entity.assertVersion(version)) throw new ConcurrencyError('ProductIdea', id, version);
    if (input.reference !== undefined && input.reference !== null) {
      const other = await this.repo.findByUnique('reference', input.reference);
      if (other && other.id !== id) {
        throw new ConflictError('Reference is already used.', { field: 'reference' });
      }
    }
    entity.update(input, principal.userId);
    return entity;
  }

  execute(command: UpdateProductIdeaCommand): Promise<ProductIdea> {
    return this.tx.run(async () => this.repo.update(await this.apply(command)));
  }
}

@Injectable()
export class DeleteProductIdeaUseCase implements UseCase<
  { principal: Principal; id: string },
  ProductIdea
> {
  constructor(@Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<ProductIdea> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}

// ── Public website (hand-written) ───────────────────────────────────────────

/** Ideas one network may submit per day (the board must not become a spam outlet). */
export const MAX_IDEAS_PER_NETWORK_PER_DAY = 5;
/** Votes one network may cast for the same idea per day (shared office networks still count). */
export const MAX_VOTES_PER_NETWORK_PER_IDEA = 20;
const DAY = 86_400_000;

export interface SubmitIdeaCommand {
  title: string;
  problem: string;
  categoryCode?: string | null;
  submitterName?: string | null;
  submitterEmail: string;
  /** Salted hash of the visitor IP. */
  ipHash: string;
}

/**
 * A visitor suggests a product. Stored as "submitted" (not public until staff
 * approve it). A live idea with the same normalised title is refused with its
 * reference, so the visitor can vote for it instead.
 */
@Injectable()
export class SubmitProductIdeaUseCase implements UseCase<SubmitIdeaCommand, ProductIdea> {
  constructor(
    @Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  async execute({ ipHash, ...input }: SubmitIdeaCommand): Promise<ProductIdea> {
    const idea = ProductIdea.create(
      { ...input, reference: makeReference('IDEA'), status: 'submitted', voteCount: 0, ipHash },
      null,
    );
    const recent = await this.repo.countRecentFromIp(ipHash, new Date(Date.now() - DAY));
    if (recent >= MAX_IDEAS_PER_NETWORK_PER_DAY) throw new RateLimitError(DAY / 1000);
    const duplicate = await this.repo.findByTitleKey(idea.titleKey);
    if (duplicate)
      throw new ConflictError('This idea has already been suggested.', {
        field: 'title',
        reference: duplicate.isPublic ? duplicate.reference : null,
      });
    return this.tx.run(() => this.repo.save(idea));
  }
}

/** Ideas on the public board, with the visitor's own votes marked. */
@Injectable()
export class ListPublicProductIdeasUseCase {
  constructor(@Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository) {}

  async execute(
    query: PublicIdeaQuery,
    voterHash: string | null,
  ): Promise<{ ideas: ProductIdea[]; voted: Set<string> }> {
    const ideas = await this.repo.findPublic(query);
    const voted = voterHash
      ? await this.repo.votedBy(
          voterHash,
          ideas.map((i) => i.id),
        )
      : new Set<string>();
    return { ideas, voted };
  }
}

/** One vote per visitor per idea; ideas that are completed or not public cannot be voted for. */
@Injectable()
export class VoteProductIdeaUseCase {
  constructor(@Inject(PRODUCT_IDEA_REPOSITORY) private readonly repo: ProductIdeaRepository) {}

  async execute(input: {
    reference: string;
    voterHash: string;
    ipHash: string;
  }): Promise<{ idea: ProductIdea; outcome: VoteOutcome }> {
    const idea = await this.repo.findByReference(input.reference);
    if (!idea || !idea.isPublic) throw new NotFoundError('ProductIdea', input.reference);
    if (!idea.isVotable)
      throw new ConflictError('Voting is closed for this idea.', { reason: 'closed' });
    const outcome = await this.repo.vote(idea.id, input.voterHash, input.ipHash, {
      count: MAX_VOTES_PER_NETWORK_PER_IDEA,
      since: new Date(Date.now() - DAY),
    });
    if (outcome === 'limited') throw new RateLimitError(DAY / 1000);
    return { idea: (await this.repo.findByReference(input.reference)) ?? idea, outcome };
  }
}
