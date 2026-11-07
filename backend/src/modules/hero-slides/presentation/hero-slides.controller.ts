import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalTicket,
} from '#core/application/ports/approval.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { PageRequest } from '#core/domain/pagination.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import {
  ApiChangeReason,
  ChangeReason,
} from '#core/presentation/decorators/change-reason.decorator.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit, Public } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { apiSchema, isoDateTime, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import {
  ApiListQuery,
  ListQuery,
  type ListQuerySpec,
} from '#core/presentation/pagination/list-query.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import { RequirePermissions } from '#modules/authorization/presentation/authorization.decorators.js';
import type { HeroSlide } from '../domain/hero-slide.entity.js';
import {
  HERO_NAVIGATION,
  HeroSettingsService,
  type HeroCarouselSettings,
} from '../application/hero-settings.js';
import {
  CreateHeroSlideUseCase,
  DeleteHeroSlideUseCase,
  GetHeroSlideUseCase,
  ListActiveHeroSlidesUseCase,
  ListHeroSlidesUseCase,
  ListOrderedHeroSlidesUseCase,
  ReorderHeroSlidesUseCase,
  UpdateHeroSlideUseCase,
} from '../application/hero-slide.use-cases.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const HeroSlideDto = apiSchema(
  'HeroSlide',
  z.object({
    id: z.uuid(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    ctaLabel: z.string().nullable(),
    ctaHref: z.string().nullable(),
    desktopImageId: z.string(),
    mobileImageId: z.string().nullable(),
    altText: z.string().nullable(),
    sortOrder: z.int().nullable(),
    active: z.boolean(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type HeroSlideDto = ApiDto<typeof HeroSlideDto>;

const toDto = (e: HeroSlide): HeroSlideDto => ({
  id: e.id,
  title: e.title,
  description: e.description,
  ctaLabel: e.ctaLabel,
  ctaHref: e.ctaHref,
  desktopImageId: e.desktopImageId,
  mobileImageId: e.mobileImageId,
  altText: e.altText,
  sortOrder: e.sortOrder,
  active: e.active,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: [
    'title',
    'ctaLabel',
    'ctaHref',
    'desktopImageId',
    'mobileImageId',
    'altText',
    'sortOrder',
    'createdAt',
    'updatedAt',
  ],
  filterable: [
    'id',
    'title',
    'ctaLabel',
    'ctaHref',
    'desktopImageId',
    'mobileImageId',
    'altText',
    'sortOrder',
    'active',
  ],
  searchable: true,
};

const CreateSchema = z.strictObject({
  title: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(2000).nullish(),
  ctaLabel: z.string().trim().max(160).nullish(),
  ctaHref: z.string().trim().max(160).nullish(),
  desktopImageId: z.string().trim().min(1).max(160),
  mobileImageId: z.string().trim().max(160).nullish(),
  altText: z.string().trim().max(160).nullish(),
  sortOrder: z.int().nullish(),
  active: z.boolean().optional(),
});
const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  title: z.string().trim().max(160).nullish(),
  description: z.string().trim().max(2000).nullish(),
  ctaLabel: z.string().trim().max(160).nullish(),
  ctaHref: z.string().trim().max(160).nullish(),
  desktopImageId: z.string().trim().min(1).max(160).optional(),
  mobileImageId: z.string().trim().max(160).nullish(),
  altText: z.string().trim().max(160).nullish(),
  sortOrder: z.int().nullish(),
  active: z.boolean().optional(),
});

const toInput = <T>(body: T) => body;

const ReorderSchema = z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) });

export const HeroCarouselSettingsDto = apiSchema(
  'HeroCarouselSettings',
  z.object({
    autoplay: z.boolean(),
    intervalSeconds: z.int(),
    transitionMs: z.int(),
    pauseOnHover: z.boolean(),
    navigation: z.enum(HERO_NAVIGATION),
  }),
);

const SettingsSchema = z.strictObject({
  autoplay: z.boolean().optional(),
  intervalSeconds: z.int().min(3).max(30).optional(),
  transitionMs: z.int().min(200).max(2000).optional(),
  pauseOnHover: z.boolean().optional(),
  navigation: z.enum(HERO_NAVIGATION).optional(),
});

/** Public image URL of an uploaded media id (served by the website BFF, cached immutably). */
const mediaUrl = (id: string) => `/api/marketplace/media/${id}`;

export const PublicHeroCarouselDto = apiSchema(
  'PublicHeroCarousel',
  z.object({
    settings: HeroCarouselSettingsDto.zod,
    slides: z.array(
      z.object({
        id: z.uuid(),
        title: z.string().nullable(),
        description: z.string().nullable(),
        ctaLabel: z.string().nullable(),
        ctaHref: z.string().nullable(),
        altText: z.string().nullable(),
        desktopImageUrl: z.string(),
        mobileImageUrl: z.string().nullable(),
      }),
    ),
  }),
);
type PublicHeroCarousel = ApiDto<typeof PublicHeroCarouselDto>;

/**
 * The homepage carousel for the public website: active slides in order plus
 * the rotation settings. No end-user token; the BFF service signature applies.
 */
@ApiTags('Marketplace (public)')
@ApiStandardErrors()
@Public()
@Controller({ path: 'marketplace/hero', version: '1' })
export class PublicHeroController extends BaseController {
  constructor(
    private readonly listActive: ListActiveHeroSlidesUseCase,
    private readonly heroSettings: HeroSettingsService,
  ) {
    super();
  }

  @Get()
  @ApiOperation({ summary: 'Active homepage carousel slides (in order) and carousel settings' })
  @ApiEnvelope(200, 'Hero carousel', PublicHeroCarouselDto)
  async get(): Promise<ApiResult<PublicHeroCarousel>> {
    const [slides, settings] = await Promise.all([
      this.listActive.execute(),
      this.heroSettings.read(),
    ]);
    return this.ok({
      settings,
      slides: slides.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        ctaLabel: s.ctaLabel,
        ctaHref: s.ctaHref,
        altText: s.altText,
        desktopImageUrl: mediaUrl(s.desktopImageId),
        mobileImageUrl: s.mobileImageId ? mediaUrl(s.mobileImageId) : null,
      })),
    });
  }
}

/** Hero carousel API (generated). Writes go through the maker–checker gate. */
@ApiTags('Hero carousel')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'hero-slides', version: '1' })
export class HeroSlidesController extends BaseController {
  constructor(
    private readonly listHeroSlides: ListHeroSlidesUseCase,
    private readonly getHeroSlide: GetHeroSlideUseCase,
    private readonly createHeroSlide: CreateHeroSlideUseCase,
    private readonly updateHeroSlide: UpdateHeroSlideUseCase,
    private readonly deleteHeroSlide: DeleteHeroSlideUseCase,
    private readonly listOrdered: ListOrderedHeroSlidesUseCase,
    private readonly reorderSlides: ReorderHeroSlidesUseCase,
    private readonly heroSettings: HeroSettingsService,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('hero-slides:read')
  @ApiOperation({ summary: 'List hero carousel (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Hero carousel', HeroSlideDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<HeroSlideDto[]>> {
    return this.paginated(await this.listHeroSlides.execute(request), toDto);
  }

  @Get('ordered')
  @RequirePermissions('hero-slides:read')
  @ApiOperation({ summary: 'Every hero slide in display order (the administration screen)' })
  @ApiEnvelope(200, 'Hero slides', HeroSlideDto, true)
  async ordered(): Promise<ApiResult<HeroSlideDto[]>> {
    return this.ok((await this.listOrdered.execute()).map(toDto));
  }

  @Post('reorder')
  @HttpCode(200)
  @RequirePermissions('hero-slides:update')
  @Audit({ action: 'HERO_SLIDES_REORDER', category: 'DATA_CHANGE', resourceType: 'HeroSlide' })
  @ApiOperation({
    summary: 'Set the display order: every slide id once, first to last',
    description:
      'Changes positions only (no content), so it applies directly; each moved slide is audited.',
  })
  @ApiZodBody(ReorderSchema)
  @ApiEnvelope(200, 'Reordered', HeroSlideDto, true)
  async reorder(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(ReorderSchema)) body: z.infer<typeof ReorderSchema>,
  ): Promise<ApiResult<HeroSlideDto[]>> {
    const slides = await this.reorderSlides.execute({ principal, ids: body.ids });
    return this.ok(slides.map(toDto), 'Order saved.');
  }

  @Get('settings')
  @RequirePermissions('hero-slides:read')
  @ApiOperation({ summary: 'How the homepage carousel rotates and which controls it shows' })
  @ApiEnvelope(200, 'Carousel settings', HeroCarouselSettingsDto)
  async getSettings(): Promise<ApiResult<HeroCarouselSettings>> {
    return this.ok(await this.heroSettings.read());
  }

  @Patch('settings')
  @RequirePermissions('hero-slides:update')
  @Audit({
    action: 'HERO_SLIDES_SETTINGS',
    category: 'DATA_CHANGE',
    resourceType: 'Setting',
    resourceId: () => null,
  })
  @ApiOperation({ summary: 'Change the carousel settings (only the fields sent are touched)' })
  @ApiZodBody(SettingsSchema)
  @ApiEnvelope(200, 'Carousel settings', HeroCarouselSettingsDto)
  async updateSettings(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(SettingsSchema)) body: z.infer<typeof SettingsSchema>,
  ): Promise<ApiResult<HeroCarouselSettings>> {
    return this.ok(await this.heroSettings.update(body, principal.userId), 'Settings saved.');
  }

  @Get(':id')
  @RequirePermissions('hero-slides:read')
  @ApiOperation({ summary: 'Get a hero slide' })
  @ApiEnvelope(200, 'Hero slide', HeroSlideDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<HeroSlideDto>> {
    return this.ok(toDto(await this.getHeroSlide.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('hero-slides:create')
  @Audit({ action: 'HERO_SLIDES_CREATE', category: 'DATA_CHANGE', resourceType: 'HeroSlide' })
  @ApiOperation({ summary: 'Create a hero slide; 202 when it needs approval' })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', HeroSlideDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<HeroSlideDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'hero-slides.create',
      principal,
      payload: body,
      comment: reason,
      execute: () => this.createHeroSlide.execute({ ...input, principal }),
    });
    return this.gated(outcome, toDto, 'Hero slide created.');
  }

  @Patch(':id')
  @RequirePermissions('hero-slides:update')
  @Audit({ action: 'HERO_SLIDES_UPDATE', category: 'DATA_CHANGE', resourceType: 'HeroSlide' })
  @ApiOperation({
    summary: 'Update a hero slide (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', HeroSlideDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<HeroSlideDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'hero-slides.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () => this.updateHeroSlide.execute({ ...input, id, principal }),
    });
    return this.gated(outcome, toDto, 'Hero slide updated.');
  }

  @Delete(':id')
  @RequirePermissions('hero-slides:delete')
  @Audit({ action: 'HERO_SLIDES_DELETE', category: 'DATA_CHANGE', resourceType: 'HeroSlide' })
  @ApiOperation({ summary: 'Delete a hero slide; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', HeroSlideDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<HeroSlideDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'hero-slides.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteHeroSlide.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Hero slide deleted.');
  }
}
