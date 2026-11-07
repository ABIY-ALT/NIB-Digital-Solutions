import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalHandler,
} from '#core/application/ports/approval.port.js';
import type { HeroSlide } from '../domain/hero-slide.entity.js';
import {
  CreateHeroSlideUseCase,
  DeleteHeroSlideUseCase,
  GetHeroSlideUseCase,
  UpdateHeroSlideUseCase,
  type CreateHeroSlideCommand,
  type UpdateHeroSlideCommand,
} from './hero-slide.use-cases.js';

/** What a checker sees of a hero slide (before / after). */
export const heroSlideView = (e: HeroSlide) => ({
  title: e.title,
  description: e.description,
  ctaLabel: e.ctaLabel,
  ctaHref: e.ctaHref,
  desktopImageId: e.desktopImageId,
  mobileImageId: e.mobileImageId,
  altText: e.altText,
  sortOrder: e.sortOrder,
  active: e.active,
});

type Payload<T> = Omit<T, 'principal'>;

/** Stored payloads are JSON (no conversion needed for these fields). */
const revive = <T extends object>(p: T): T => p;

/**
 * Maker–checker handlers (generated). Put an action under four-eyes control
 * with configuration only: APPROVAL_ACTIONS=hero-slides.create,hero-slides.update,hero-slides.delete
 */
@Injectable()
export class HeroSlideApprovalHandlers implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_GATE) private readonly gate: ApprovalGate,
    private readonly getHeroSlide: GetHeroSlideUseCase,
    private readonly createHeroSlide: CreateHeroSlideUseCase,
    private readonly updateHeroSlide: UpdateHeroSlideUseCase,
    private readonly deleteHeroSlide: DeleteHeroSlideUseCase,
  ) {}

  onModuleInit(): void {
    const create: ApprovalHandler<Payload<CreateHeroSlideCommand>> = {
      action: 'hero-slides.create',
      resourceType: 'HeroSlide',
      checkerPermissions: ['hero-slides:create'],
      describe: async (p, maker) => {
        const draft = await this.createHeroSlide.draft({ ...revive(p), principal: maker });
        return {
          resourceId: null,
          summary: `Create hero slide ${draft.title}`.trim(),
          before: null,
          after: heroSlideView(draft),
        };
      },
      execute: async (p, maker) =>
        heroSlideView(await this.createHeroSlide.execute({ ...revive(p), principal: maker })),
    };
    const update: ApprovalHandler<Payload<UpdateHeroSlideCommand>> = {
      action: 'hero-slides.update',
      resourceType: 'HeroSlide',
      checkerPermissions: ['hero-slides:update'],
      describe: async (p, maker) => {
        const before = heroSlideView(await this.getHeroSlide.execute(p.id));
        const current = await this.updateHeroSlide.apply({ ...revive(p), principal: maker });
        return {
          resourceId: p.id,
          summary: `Update hero slide ${current.title}`.trim(),
          before,
          after: heroSlideView(current),
        };
      },
      execute: async (p, maker) =>
        heroSlideView(await this.updateHeroSlide.execute({ ...revive(p), principal: maker })),
    };
    const remove: ApprovalHandler<{ id: string }> = {
      action: 'hero-slides.delete',
      resourceType: 'HeroSlide',
      checkerPermissions: ['hero-slides:delete'],
      describe: async ({ id }) => {
        const current = await this.getHeroSlide.execute(id);
        return {
          resourceId: id,
          summary: `Delete hero slide ${current.title}`.trim(),
          before: heroSlideView(current),
          after: null,
        };
      },
      execute: async ({ id }, maker) =>
        heroSlideView(await this.deleteHeroSlide.execute({ id, principal: maker })),
    };
    this.gate.register(create);
    this.gate.register(update);
    this.gate.register(remove);
  }
}
