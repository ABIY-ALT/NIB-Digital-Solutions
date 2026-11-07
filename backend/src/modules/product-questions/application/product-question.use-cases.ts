import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { ConcurrencyError } from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import type { ProductQuestion } from '../domain/product-question.entity.js';
import {
  PRODUCT_QUESTION_REPOSITORY,
  type ProductQuestionRepository,
} from '../domain/product-question.repository.js';

/**
 * Staff side of product questions (generated, then adapted): questions are
 * created only by customers on the website; staff list them, change their
 * status and delete them. Answers go through QuestionWorkflow.
 */

@Injectable()
export class ListProductQuestionsUseCase implements UseCase<PageRequest, Page<ProductQuestion>> {
  constructor(
    @Inject(PRODUCT_QUESTION_REPOSITORY) private readonly repo: ProductQuestionRepository,
  ) {}

  execute(request: PageRequest): Promise<Page<ProductQuestion>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetProductQuestionUseCase implements UseCase<string, ProductQuestion> {
  constructor(
    @Inject(PRODUCT_QUESTION_REPOSITORY) private readonly repo: ProductQuestionRepository,
  ) {}

  execute(id: string): Promise<ProductQuestion> {
    return this.repo.getById(id);
  }
}

export interface UpdateProductQuestionCommand {
  principal: Principal;
  id: string;
  version: number;
  status?: string;
}

@Injectable()
export class UpdateProductQuestionUseCase implements UseCase<
  UpdateProductQuestionCommand,
  ProductQuestion
> {
  constructor(
    @Inject(PRODUCT_QUESTION_REPOSITORY) private readonly repo: ProductQuestionRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply({
    principal,
    id,
    version,
    status,
  }: UpdateProductQuestionCommand): Promise<ProductQuestion> {
    const entity = await this.repo.getById(id);
    if (!entity.assertVersion(version)) throw new ConcurrencyError('ProductQuestion', id, version);
    entity.update({ status }, principal.userId);
    return entity;
  }

  execute(command: UpdateProductQuestionCommand): Promise<ProductQuestion> {
    return this.tx.run(async () => this.repo.update(await this.apply(command)));
  }
}

@Injectable()
export class DeleteProductQuestionUseCase implements UseCase<
  { principal: Principal; id: string },
  ProductQuestion
> {
  constructor(
    @Inject(PRODUCT_QUESTION_REPOSITORY) private readonly repo: ProductQuestionRepository,
  ) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<ProductQuestion> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}
