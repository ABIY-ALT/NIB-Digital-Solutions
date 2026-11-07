import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { ProductInquiry } from '../domain/product-inquiry.entity.js';
import {
  CreateProductInquiryUseCase,
  DeleteProductInquiryUseCase,
  GetProductInquiryUseCase,
  UpdateProductInquiryUseCase,
  type CreateProductInquiryCommand,
  type UpdateProductInquiryCommand,
} from './product-inquiry.use-cases.js';

/** What a checker sees of a product inquiry (before / after). */
export const productInquiryView = (e: ProductInquiry) => ({
  reference: e.reference,
  customerName: e.customerName,
  company: e.company,
  email: e.email,
  phone: e.phone,
  productSlug: e.productSlug,
  inquiryType: e.inquiryType,
  message: e.message,
  requirements: e.requirements,
  contactMethod: e.contactMethod,
  source: e.source,
  status: e.status,
  assignedTo: e.assignedTo,
  respondedAt: e.respondedAt?.toISOString() ?? null,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON: turn ISO strings back into dates. */
const revive = <T extends object>(p: T): T => ({
  ...p,
  ...('respondedAt' in p && typeof p.respondedAt === 'string'
    ? { respondedAt: new Date(p.respondedAt) }
    : {}),
});

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=product-inquiries.create,product-inquiries.update,product-inquiries.delete
 */
@Injectable()
export class ProductInquiryApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getProductInquiry: GetProductInquiryUseCase,
    private readonly createProductInquiry: CreateProductInquiryUseCase,
    private readonly updateProductInquiry: UpdateProductInquiryUseCase,
    private readonly deleteProductInquiry: DeleteProductInquiryUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateProductInquiryCommand>> = {
      action: 'product-inquiries.create',
      resourceType: 'ProductInquiry',
      checkerPermissions: ['product-inquiries:create'],
      describe: async (p, maker) => {
        const draft = await this.createProductInquiry.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create product inquiry ${draft.reference}`.trim(),
          before: null,
          after: productInquiryView(draft),
        };
      },
      execute: async (p, maker) =>
        productInquiryView(
          await this.createProductInquiry.execute({ ...revive(p), principal: maker }),
        ),
    };
    const update: ApprovalHandler<Payload<UpdateProductInquiryCommand>> = {
      action: 'product-inquiries.update',
      resourceType: 'ProductInquiry',
      checkerPermissions: ['product-inquiries:update'],
      describe: async (p, maker) => {
        const before = productInquiryView(await this.getProductInquiry.execute(p.id));
        const current = await this.updateProductInquiry.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update product inquiry ${current.reference}`.trim(),
          before,
          after: productInquiryView(current),
        };
      },
      execute: async (p, maker) =>
        productInquiryView(
          await this.updateProductInquiry.execute({ ...revive(p), principal: maker }),
        ),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'product-inquiries.delete',
      resourceType: 'ProductInquiry',
      checkerPermissions: ['product-inquiries:delete'],
      describe: async ({ id }) => {
        const current = await this.getProductInquiry.execute(id);
        return {
          resourceId: id,
          summary: `Delete product inquiry ${current.reference}`.trim(),
          before: productInquiryView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        productInquiryView(await this.deleteProductInquiry.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
