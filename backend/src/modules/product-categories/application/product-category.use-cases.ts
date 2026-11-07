import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { ConcurrencyError, ConflictError } from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import { ProductCategory, type ProductCategoryInput } from '../domain/product-category.entity.js';
import {
  PRODUCT_CATEGORY_REPOSITORY,
  type ProductCategoryRepository,
} from '../domain/product-category.repository.js';

/** Product categories: one use case per operation (generated). */

@Injectable()
export class ListProductCategoriesUseCase implements UseCase<PageRequest, Page<ProductCategory>> {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY) private readonly repo: ProductCategoryRepository,
  ) {}

  execute(request: PageRequest): Promise<Page<ProductCategory>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetProductCategoryUseCase implements UseCase<string, ProductCategory> {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY) private readonly repo: ProductCategoryRepository,
  ) {}

  execute(id: string): Promise<ProductCategory> {
    return this.repo.getById(id);
  }
}

export interface CreateProductCategoryCommand extends ProductCategoryInput {
  principal: Principal;
}

@Injectable()
export class CreateProductCategoryUseCase implements UseCase<
  CreateProductCategoryCommand,
  ProductCategory
> {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY) private readonly repo: ProductCategoryRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Validates without saving (used by the maker–checker preview). */
  async draft({ principal, ...input }: CreateProductCategoryCommand): Promise<ProductCategory> {
    if (input.code !== undefined && input.code !== null) {
      const other = await this.repo.findByUnique('code', input.code);
      if (other && other.id !== '') {
        throw new ConflictError('Code is already used.', { field: 'code' });
      }
    }
    return ProductCategory.create(input, principal.userId);
  }

  execute(command: CreateProductCategoryCommand): Promise<ProductCategory> {
    return this.tx.run(async () => this.repo.save(await this.draft(command)));
  }
}

export interface UpdateProductCategoryCommand extends Partial<ProductCategoryInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateProductCategoryUseCase implements UseCase<
  UpdateProductCategoryCommand,
  ProductCategory
> {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY) private readonly repo: ProductCategoryRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply({
    principal,
    id,
    version,
    ...input
  }: UpdateProductCategoryCommand): Promise<ProductCategory> {
    const entity = await this.repo.getById(id);
    if (!entity.assertVersion(version)) throw new ConcurrencyError('ProductCategory', id, version);
    if (input.code !== undefined && input.code !== null) {
      const other = await this.repo.findByUnique('code', input.code);
      if (other && other.id !== id) {
        throw new ConflictError('Code is already used.', { field: 'code' });
      }
    }
    entity.update(input, principal.userId);
    return entity;
  }

  execute(command: UpdateProductCategoryCommand): Promise<ProductCategory> {
    return this.tx.run(async () => this.repo.update(await this.apply(command)));
  }
}

@Injectable()
export class DeleteProductCategoryUseCase implements UseCase<
  { principal: Principal; id: string },
  ProductCategory
> {
  constructor(
    @Inject(PRODUCT_CATEGORY_REPOSITORY) private readonly repo: ProductCategoryRepository,
  ) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<ProductCategory> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}
