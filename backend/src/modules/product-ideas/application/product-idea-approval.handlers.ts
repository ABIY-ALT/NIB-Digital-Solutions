import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { ProductIdea } from '../domain/product-idea.entity.js';
import {
  CreateProductIdeaUseCase,
  DeleteProductIdeaUseCase,
  GetProductIdeaUseCase,
  UpdateProductIdeaUseCase,
  type CreateProductIdeaCommand,
  type UpdateProductIdeaCommand,
} from './product-idea.use-cases.js';

/** What a checker sees of a product idea (before / after). */
export const productIdeaView = (e: ProductIdea) => ({
  reference: e.reference,
  title: e.title,
  problem: e.problem,
  categoryCode: e.categoryCode,
  submitterName: e.submitterName,
  submitterEmail: e.submitterEmail,
  status: e.status,
  voteCount: e.voteCount,
  adminNote: e.adminNote,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON (no conversion needed for these fields). */
const revive = <T extends object>(p: T): T => p;

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=product-ideas.create,product-ideas.update,product-ideas.delete
 */
@Injectable()
export class ProductIdeaApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getProductIdea: GetProductIdeaUseCase,
    private readonly createProductIdea: CreateProductIdeaUseCase,
    private readonly updateProductIdea: UpdateProductIdeaUseCase,
    private readonly deleteProductIdea: DeleteProductIdeaUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateProductIdeaCommand>> = {
      action: 'product-ideas.create',
      resourceType: 'ProductIdea',
      checkerPermissions: ['product-ideas:create'],
      describe: async (p, maker) => {
        const draft = await this.createProductIdea.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create product idea ${draft.reference}`.trim(),
          before: null,
          after: productIdeaView(draft),
        };
      },
      execute: async (p, maker) =>
        productIdeaView(await this.createProductIdea.execute({ ...revive(p), principal: maker })),
    };
    const update: ApprovalHandler<Payload<UpdateProductIdeaCommand>> = {
      action: 'product-ideas.update',
      resourceType: 'ProductIdea',
      checkerPermissions: ['product-ideas:update'],
      describe: async (p, maker) => {
        const before = productIdeaView(await this.getProductIdea.execute(p.id));
        const current = await this.updateProductIdea.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update product idea ${current.reference}`.trim(),
          before,
          after: productIdeaView(current),
        };
      },
      execute: async (p, maker) =>
        productIdeaView(await this.updateProductIdea.execute({ ...revive(p), principal: maker })),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'product-ideas.delete',
      resourceType: 'ProductIdea',
      checkerPermissions: ['product-ideas:delete'],
      describe: async ({ id }) => {
        const current = await this.getProductIdea.execute(id);
        return {
          resourceId: id,
          summary: `Delete product idea ${current.reference}`.trim(),
          before: productIdeaView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        productIdeaView(await this.deleteProductIdea.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
