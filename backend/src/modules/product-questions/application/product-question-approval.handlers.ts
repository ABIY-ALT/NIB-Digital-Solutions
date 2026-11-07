import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { ProductQuestion } from '../domain/product-question.entity.js';
import {
  DeleteProductQuestionUseCase,
  GetProductQuestionUseCase,
  UpdateProductQuestionUseCase,
  type UpdateProductQuestionCommand,
} from './product-question.use-cases.js';

/** What a checker sees of a product question (no customer e-mail: not needed to decide). */
export const productQuestionView = (e: ProductQuestion) => ({
  reference: e.reference,
  productSlug: e.productSlug,
  customerName: e.customerName,
  question: e.question,
  status: e.status,
});

type Payload<T> = Omit<T, 'principal'>;

/**
 * Maker–checker handlers. Put an action under four-eyes control with
 * configuration only: APPROVAL_ACTIONS=product-questions.update,product-questions.delete
 */
@Injectable()
export class ProductQuestionApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getProductQuestion: GetProductQuestionUseCase,
    private readonly updateProductQuestion: UpdateProductQuestionUseCase,
    private readonly deleteProductQuestion: DeleteProductQuestionUseCase,
  ) {}

  onModuleInit(): void {
    const update: ApprovalHandler<Payload<UpdateProductQuestionCommand>> = {
      action: 'product-questions.update',
      resourceType: 'ProductQuestion',
      checkerPermissions: ['product-questions:update'],
      describe: async (p, maker) => {
        const before = productQuestionView(await this.getProductQuestion.execute(p.id));
        const current = await this.updateProductQuestion.apply({ ...p, principal: maker });
        return {
          resourceId: p.id,
          summary: `Update product question ${current.reference}`,
          before,
          after: productQuestionView(current),
        };
      },
      execute: async (p, maker) =>
        productQuestionView(await this.updateProductQuestion.execute({ ...p, principal: maker })),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'product-questions.delete',
      resourceType: 'ProductQuestion',
      checkerPermissions: ['product-questions:delete'],
      describe: async ({ id }) => {
        const current = await this.getProductQuestion.execute(id);
        return {
          resourceId: id,
          summary: `Delete product question ${current.reference}`,
          before: productQuestionView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        productQuestionView(await this.deleteProductQuestion.execute({ id, principal: maker })),
    };
    this.gate.register(update);
    this.gate.register(remove);
  }
}
