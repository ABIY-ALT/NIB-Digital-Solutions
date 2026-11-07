import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { ConcurrencyError, ConflictError } from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import { assertKnownTaxonomy } from '#modules/marketplace/application/taxonomy.js';
import { ReferenceDataUseCases } from '#modules/reference-data/application/reference-data.use-cases.js';
import { DigitalProduct, type DigitalProductInput } from '../domain/digital-product.entity.js';
import {
  DIGITAL_PRODUCT_REPOSITORY,
  type DigitalProductRepository,
} from '../domain/digital-product.repository.js';

/** Digital products: one use case per operation (generated). */

@Injectable()
export class ListDigitalProductsUseCase implements UseCase<PageRequest, Page<DigitalProduct>> {
  constructor(
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly repo: DigitalProductRepository,
  ) {}

  execute(request: PageRequest): Promise<Page<DigitalProduct>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetDigitalProductUseCase implements UseCase<string, DigitalProduct> {
  constructor(
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly repo: DigitalProductRepository,
  ) {}

  execute(id: string): Promise<DigitalProduct> {
    return this.repo.getById(id);
  }
}

export interface CreateDigitalProductCommand extends DigitalProductInput {
  principal: Principal;
}

@Injectable()
export class CreateDigitalProductUseCase implements UseCase<
  CreateDigitalProductCommand,
  DigitalProduct
> {
  constructor(
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly repo: DigitalProductRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    private readonly refdata: ReferenceDataUseCases,
  ) {}

  /** Validates without saving (used by the maker–checker preview). */
  async draft({ principal, ...input }: CreateDigitalProductCommand): Promise<DigitalProduct> {
    if (input.slug !== undefined && input.slug !== null) {
      const other = await this.repo.findByUnique('slug', input.slug);
      if (other && other.id !== '') {
        throw new ConflictError('Slug is already used.', { field: 'slug' });
      }
    }
    await assertKnownTaxonomy(this.refdata, { industries: input.industries, needs: input.needs });
    return DigitalProduct.create(input, principal.userId);
  }

  execute(command: CreateDigitalProductCommand): Promise<DigitalProduct> {
    return this.tx.run(async () => this.repo.save(await this.draft(command)));
  }
}

export interface UpdateDigitalProductCommand extends Partial<DigitalProductInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateDigitalProductUseCase implements UseCase<
  UpdateDigitalProductCommand,
  DigitalProduct
> {
  constructor(
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly repo: DigitalProductRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
    private readonly refdata: ReferenceDataUseCases,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply({
    principal,
    id,
    version,
    ...input
  }: UpdateDigitalProductCommand): Promise<DigitalProduct> {
    const entity = await this.repo.getById(id);
    if (!entity.assertVersion(version)) throw new ConcurrencyError('DigitalProduct', id, version);
    if (input.slug !== undefined && input.slug !== null) {
      const other = await this.repo.findByUnique('slug', input.slug);
      if (other && other.id !== id) {
        throw new ConflictError('Slug is already used.', { field: 'slug' });
      }
    }
    // Only codes this change adds must exist: a product keeps the ones it already has.
    const added = (current: string[], next?: string[]) =>
      next?.filter((v) => !current.includes(v.trim().toLowerCase()));
    await assertKnownTaxonomy(this.refdata, {
      industries: added(entity.industries, input.industries),
      needs: added(entity.needs, input.needs),
    });
    entity.update(input, principal.userId);
    return entity;
  }

  execute(command: UpdateDigitalProductCommand): Promise<DigitalProduct> {
    return this.tx.run(async () => this.repo.update(await this.apply(command)));
  }
}

@Injectable()
export class DeleteDigitalProductUseCase implements UseCase<
  { principal: Principal; id: string },
  DigitalProduct
> {
  constructor(
    @Inject(DIGITAL_PRODUCT_REPOSITORY) private readonly repo: DigitalProductRepository,
  ) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<DigitalProduct> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}
