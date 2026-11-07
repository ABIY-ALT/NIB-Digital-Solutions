import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { DigitalProduct } from '../domain/digital-product.entity.js';
import {
  CreateDigitalProductUseCase,
  DeleteDigitalProductUseCase,
  GetDigitalProductUseCase,
  UpdateDigitalProductUseCase,
  type CreateDigitalProductCommand,
  type UpdateDigitalProductCommand,
} from './digital-product.use-cases.js';

/** What a checker sees of a digital product (before / after). */
export const digitalProductView = (e: DigitalProduct) => ({
  slug: e.slug,
  name: e.name,
  tagline: e.tagline,
  summary: e.summary,
  overview: e.overview,
  problem: e.problem,
  categoryCode: e.categoryCode,
  status: e.status,
  availability: e.availability,
  featured: e.featured,
  customizable: e.customizable,
  releaseDate: e.releaseDate,
  developerId: e.developerId,
  backupDeveloperId: e.backupDeveloperId,
  thirdDeveloperId: e.thirdDeveloperId,
  supportStatus: e.supportStatus,
  icon: e.icon,
  accent: e.accent,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON (no conversion needed for these fields). */
const revive = <T extends object>(p: T): T => p;

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=digital-products.create,digital-products.update,digital-products.delete
 */
@Injectable()
export class DigitalProductApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getDigitalProduct: GetDigitalProductUseCase,
    private readonly createDigitalProduct: CreateDigitalProductUseCase,
    private readonly updateDigitalProduct: UpdateDigitalProductUseCase,
    private readonly deleteDigitalProduct: DeleteDigitalProductUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateDigitalProductCommand>> = {
      action: 'digital-products.create',
      resourceType: 'DigitalProduct',
      checkerPermissions: ['digital-products:create'],
      describe: async (p, maker) => {
        const draft = await this.createDigitalProduct.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create digital product ${draft.slug}`.trim(),
          before: null,
          after: digitalProductView(draft),
        };
      },
      execute: async (p, maker) =>
        digitalProductView(
          await this.createDigitalProduct.execute({ ...revive(p), principal: maker }),
        ),
    };
    const update: ApprovalHandler<Payload<UpdateDigitalProductCommand>> = {
      action: 'digital-products.update',
      resourceType: 'DigitalProduct',
      checkerPermissions: ['digital-products:update'],
      describe: async (p, maker) => {
        const before = digitalProductView(await this.getDigitalProduct.execute(p.id));
        const current = await this.updateDigitalProduct.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update digital product ${current.slug}`.trim(),
          before,
          after: digitalProductView(current),
        };
      },
      execute: async (p, maker) =>
        digitalProductView(
          await this.updateDigitalProduct.execute({ ...revive(p), principal: maker }),
        ),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'digital-products.delete',
      resourceType: 'DigitalProduct',
      checkerPermissions: ['digital-products:delete'],
      describe: async ({ id }) => {
        const current = await this.getDigitalProduct.execute(id);
        return {
          resourceId: id,
          summary: `Delete digital product ${current.slug}`.trim(),
          before: digitalProductView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        digitalProductView(await this.deleteDigitalProduct.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
