import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { ProductReview } from '../domain/product-review.entity.js';
import {
  CreateProductReviewUseCase,
  DeleteProductReviewUseCase,
  GetProductReviewUseCase,
  UpdateProductReviewUseCase,
  type CreateProductReviewCommand,
  type UpdateProductReviewCommand,
} from './product-review.use-cases.js';

/** What a checker sees of a product review (before / after). */
export const productReviewView = (e: ProductReview) => ({
  reference: e.reference,
  productSlug: e.productSlug,
  rating: e.rating,
  title: e.title,
  body: e.body,
  reviewerName: e.reviewerName,
  reviewerRole: e.reviewerRole,
  reviewerEmail: e.reviewerEmail,
  status: e.status,
  reply: e.reply,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON (no conversion needed for these fields). */
const revive = <T extends object>(p: T): T => p;

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=product-reviews.create,product-reviews.update,product-reviews.delete
 */
@Injectable()
export class ProductReviewApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getProductReview: GetProductReviewUseCase,
    private readonly createProductReview: CreateProductReviewUseCase,
    private readonly updateProductReview: UpdateProductReviewUseCase,
    private readonly deleteProductReview: DeleteProductReviewUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateProductReviewCommand>> = {
      action: 'product-reviews.create',
      resourceType: 'ProductReview',
      checkerPermissions: ['product-reviews:create'],
      describe: async (p, maker) => {
        const draft = await this.createProductReview.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create product review ${draft.reference}`.trim(),
          before: null,
          after: productReviewView(draft),
        };
      },
      execute: async (p, maker) =>
        productReviewView(
          await this.createProductReview.execute({ ...revive(p), principal: maker }),
        ),
    };
    const update: ApprovalHandler<Payload<UpdateProductReviewCommand>> = {
      action: 'product-reviews.update',
      resourceType: 'ProductReview',
      checkerPermissions: ['product-reviews:update'],
      describe: async (p, maker) => {
        const before = productReviewView(await this.getProductReview.execute(p.id));
        const current = await this.updateProductReview.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update product review ${current.reference}`.trim(),
          before,
          after: productReviewView(current),
        };
      },
      execute: async (p, maker) =>
        productReviewView(
          await this.updateProductReview.execute({ ...revive(p), principal: maker }),
        ),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'product-reviews.delete',
      resourceType: 'ProductReview',
      checkerPermissions: ['product-reviews:delete'],
      describe: async ({ id }) => {
        const current = await this.getProductReview.execute(id);
        return {
          resourceId: id,
          summary: `Delete product review ${current.reference}`.trim(),
          before: productReviewView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        productReviewView(await this.deleteProductReview.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
