import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { ProductCategory } from '../domain/product-category.entity.js';
import {
  CreateProductCategoryUseCase,
  DeleteProductCategoryUseCase,
  GetProductCategoryUseCase,
  UpdateProductCategoryUseCase,
  type CreateProductCategoryCommand,
  type UpdateProductCategoryCommand,
} from './product-category.use-cases.js';

/** What a checker sees of a product category (before / after). */
export const productCategoryView = (e: ProductCategory) => ({
  code: e.code,
  name: e.name,
  description: e.description,
  icon: e.icon,
  sortOrder: e.sortOrder,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON (no conversion needed for these fields). */
const revive = <T extends object>(p: T): T => p;

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=product-categories.create,product-categories.update,product-categories.delete
 */
@Injectable()
export class ProductCategoryApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getProductCategory: GetProductCategoryUseCase,
    private readonly createProductCategory: CreateProductCategoryUseCase,
    private readonly updateProductCategory: UpdateProductCategoryUseCase,
    private readonly deleteProductCategory: DeleteProductCategoryUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateProductCategoryCommand>> = {
      action: 'product-categories.create',
      resourceType: 'ProductCategory',
      checkerPermissions: ['product-categories:create'],
      describe: async (p, maker) => {
        const draft = await this.createProductCategory.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create product category ${draft.code}`.trim(),
          before: null,
          after: productCategoryView(draft),
        };
      },
      execute: async (p, maker) =>
        productCategoryView(
          await this.createProductCategory.execute({ ...revive(p), principal: maker }),
        ),
    };
    const update: ApprovalHandler<Payload<UpdateProductCategoryCommand>> = {
      action: 'product-categories.update',
      resourceType: 'ProductCategory',
      checkerPermissions: ['product-categories:update'],
      describe: async (p, maker) => {
        const before = productCategoryView(await this.getProductCategory.execute(p.id));
        const current = await this.updateProductCategory.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update product category ${current.code}`.trim(),
          before,
          after: productCategoryView(current),
        };
      },
      execute: async (p, maker) =>
        productCategoryView(
          await this.updateProductCategory.execute({ ...revive(p), principal: maker }),
        ),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'product-categories.delete',
      resourceType: 'ProductCategory',
      checkerPermissions: ['product-categories:delete'],
      describe: async ({ id }) => {
        const current = await this.getProductCategory.execute(id);
        return {
          resourceId: id,
          summary: `Delete product category ${current.code}`.trim(),
          before: productCategoryView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        productCategoryView(await this.deleteProductCategory.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
