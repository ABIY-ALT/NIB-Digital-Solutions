import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { ProductDeveloper } from '../domain/product-developer.entity.js';
import {
  CreateProductDeveloperUseCase,
  DeleteProductDeveloperUseCase,
  GetProductDeveloperUseCase,
  UpdateProductDeveloperUseCase,
  type CreateProductDeveloperCommand,
  type UpdateProductDeveloperCommand,
} from './product-developer.use-cases.js';

/** What a checker sees of a product developer (before / after). */
export const productDeveloperView = (e: ProductDeveloper) => ({
  name: e.name,
  email: e.email,
  telegramChatId: e.telegramChatId,
  telegramUsername: e.telegramUsername,
  active: e.active,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON (no conversion needed for these fields). */
const revive = <T extends object>(p: T): T => p;

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=product-developers.create,product-developers.update,product-developers.delete
 */
@Injectable()
export class ProductDeveloperApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getProductDeveloper: GetProductDeveloperUseCase,
    private readonly createProductDeveloper: CreateProductDeveloperUseCase,
    private readonly updateProductDeveloper: UpdateProductDeveloperUseCase,
    private readonly deleteProductDeveloper: DeleteProductDeveloperUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateProductDeveloperCommand>> = {
      action: 'product-developers.create',
      resourceType: 'ProductDeveloper',
      checkerPermissions: ['product-developers:create'],
      describe: async (p, maker) => {
        const draft = await this.createProductDeveloper.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create product developer ${draft.name}`.trim(),
          before: null,
          after: productDeveloperView(draft),
        };
      },
      execute: async (p, maker) =>
        productDeveloperView(
          await this.createProductDeveloper.execute({ ...revive(p), principal: maker }),
        ),
    };
    const update: ApprovalHandler<Payload<UpdateProductDeveloperCommand>> = {
      action: 'product-developers.update',
      resourceType: 'ProductDeveloper',
      checkerPermissions: ['product-developers:update'],
      describe: async (p, maker) => {
        const before = productDeveloperView(await this.getProductDeveloper.execute(p.id));
        const current = await this.updateProductDeveloper.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update product developer ${current.name}`.trim(),
          before,
          after: productDeveloperView(current),
        };
      },
      execute: async (p, maker) =>
        productDeveloperView(
          await this.updateProductDeveloper.execute({ ...revive(p), principal: maker }),
        ),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'product-developers.delete',
      resourceType: 'ProductDeveloper',
      checkerPermissions: ['product-developers:delete'],
      describe: async ({ id }) => {
        const current = await this.getProductDeveloper.execute(id);
        return {
          resourceId: id,
          summary: `Delete product developer ${current.name}`.trim(),
          before: productDeveloperView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        productDeveloperView(await this.deleteProductDeveloper.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
