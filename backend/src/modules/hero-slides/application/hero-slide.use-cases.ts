import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '#core/application/ports/transaction.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import {
  ConcurrencyError,
  ValidationError,
  type FieldIssue,
} from '#core/domain/errors/app-error.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import { HeroSlide, type HeroSlideInput } from '../domain/hero-slide.entity.js';
import {
  HERO_SLIDE_REPOSITORY,
  type HeroSlideRepository,
} from '../domain/hero-slide.repository.js';

/** Hero carousel: one use case per operation (generated, then extended). */

/** A slide may only point at images that were uploaded through the media store. */
async function assertMediaExists(repo: HeroSlideRepository, slide: HeroSlide): Promise<void> {
  const ids = [slide.desktopImageId, slide.mobileImageId].filter((v): v is string => !!v);
  const missing = new Set(await repo.missingMedia(ids));
  const issues: FieldIssue[] = [];
  if (missing.has(slide.desktopImageId))
    issues.push({
      field: 'desktopImageId',
      message: 'This image no longer exists; upload it again',
    });
  if (slide.mobileImageId && missing.has(slide.mobileImageId))
    issues.push({
      field: 'mobileImageId',
      message: 'This image no longer exists; upload it again',
    });
  if (issues.length) throw new ValidationError(issues);
}

/** Every slide in display order (administration). */
@Injectable()
export class ListOrderedHeroSlidesUseCase implements UseCase<void, HeroSlide[]> {
  constructor(@Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository) {}

  execute(): Promise<HeroSlide[]> {
    return this.repo.findOrdered();
  }
}

/** The slides the public homepage shows: active ones, in display order. */
@Injectable()
export class ListActiveHeroSlidesUseCase implements UseCase<void, HeroSlide[]> {
  constructor(@Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository) {}

  execute(): Promise<HeroSlide[]> {
    return this.repo.findOrdered({ activeOnly: true });
  }
}

/**
 * Sets the display order. `ids` must list every slide exactly once (the order
 * shown in the administration screen); positions become 0, 1, 2, … and only
 * slides whose position changed are written (each write is audited).
 */
@Injectable()
export class ReorderHeroSlidesUseCase implements UseCase<
  { principal: Principal; ids: string[] },
  HeroSlide[]
> {
  constructor(
    @Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  execute({ principal, ids }: { principal: Principal; ids: string[] }): Promise<HeroSlide[]> {
    return this.tx.run(async () => {
      const slides = await this.repo.findOrdered();
      const byId = new Map(slides.map((s) => [s.id, s]));
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== slides.length ||
        ids.some((id) => !byId.has(id))
      )
        throw new ValidationError([
          { field: 'ids', message: 'The slide list changed meanwhile; reload and try again' },
        ]);
      const result: HeroSlide[] = [];
      for (const [position, id] of ids.entries()) {
        const slide = byId.get(id)!;
        if (slide.sortOrder !== position) {
          slide.update({ sortOrder: position }, principal.userId);
          result.push(await this.repo.update(slide));
        } else result.push(slide);
      }
      return result;
    });
  }
}

@Injectable()
export class ListHeroSlidesUseCase implements UseCase<PageRequest, Page<HeroSlide>> {
  constructor(@Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository) {}

  execute(request: PageRequest): Promise<Page<HeroSlide>> {
    return this.repo.findPage(request);
  }
}

@Injectable()
export class GetHeroSlideUseCase implements UseCase<string, HeroSlide> {
  constructor(@Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository) {}

  execute(id: string): Promise<HeroSlide> {
    return this.repo.getById(id);
  }
}

export interface CreateHeroSlideCommand extends HeroSlideInput {
  principal: Principal;
}

@Injectable()
export class CreateHeroSlideUseCase implements UseCase<CreateHeroSlideCommand, HeroSlide> {
  constructor(
    @Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Validates without saving (used by the maker–checker preview). New slides go last. */
  async draft({ principal, ...input }: CreateHeroSlideCommand): Promise<HeroSlide> {
    const entity = HeroSlide.create(input, principal.userId);
    await assertMediaExists(this.repo, entity);
    if (entity.sortOrder === null) {
      const slides = await this.repo.findOrdered();
      const last = Math.max(-1, ...slides.map((s) => s.sortOrder ?? -1));
      entity.update({ sortOrder: last + 1 }, principal.userId);
    }
    return entity;
  }

  execute(command: CreateHeroSlideCommand): Promise<HeroSlide> {
    return this.tx.run(async () => this.repo.save(await this.draft(command)));
  }
}

export interface UpdateHeroSlideCommand extends Partial<HeroSlideInput> {
  principal: Principal;
  id: string;
  version: number;
}

@Injectable()
export class UpdateHeroSlideUseCase implements UseCase<UpdateHeroSlideCommand, HeroSlide> {
  constructor(
    @Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository,
    @Inject(TRANSACTION_MANAGER) private readonly tx: TransactionManager,
  ) {}

  /** Loads the record and applies the change in memory (validation only). */
  async apply({ principal, id, version, ...input }: UpdateHeroSlideCommand): Promise<HeroSlide> {
    const entity = await this.repo.getById(id);
    if (!entity.assertVersion(version)) throw new ConcurrencyError('HeroSlide', id, version);

    entity.update(input, principal.userId);
    await assertMediaExists(this.repo, entity);
    return entity;
  }

  execute(command: UpdateHeroSlideCommand): Promise<HeroSlide> {
    return this.tx.run(async () => this.repo.update(await this.apply(command)));
  }
}

@Injectable()
export class DeleteHeroSlideUseCase implements UseCase<
  { principal: Principal; id: string },
  HeroSlide
> {
  constructor(@Inject(HERO_SLIDE_REPOSITORY) private readonly repo: HeroSlideRepository) {}

  async execute({ principal, id }: { principal: Principal; id: string }): Promise<HeroSlide> {
    return this.repo.softDelete(await this.repo.getById(id), principal.userId);
  }
}
