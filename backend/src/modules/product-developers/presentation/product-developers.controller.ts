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
import { Audit } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { apiSchema, isoDateTime, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import {
  ApiListQuery,
  ListQuery,
  type ListQuerySpec,
} from '#core/presentation/pagination/list-query.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '#modules/authorization/presentation/authorization.decorators.js';
import type { ProductDeveloper } from '../domain/product-developer.entity.js';
import {
  IssueTelegramLinkCodeUseCase,
  ListDeveloperOptionsUseCase,
  UnlinkTelegramUseCase,
  CreateProductDeveloperUseCase,
  DeleteProductDeveloperUseCase,
  GetProductDeveloperUseCase,
  ListProductDevelopersUseCase,
  UpdateProductDeveloperUseCase,
} from '../application/product-developer.use-cases.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const ProductDeveloperDto = apiSchema(
  'ProductDeveloper',
  z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    /** The developer linked their Telegram through the bot (the chat id itself is never exposed). */
    telegramLinked: z.boolean(),
    telegramUsername: z.string().nullable(),
    telegramLinkedAt: isoDateTime().nullable(),
    active: z.boolean(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type ProductDeveloperDto = ApiDto<typeof ProductDeveloperDto>;

const toDto = (e: ProductDeveloper): ProductDeveloperDto => ({
  id: e.id,
  name: e.name,
  email: e.email,
  telegramLinked: !!e.telegramChatId,
  telegramUsername: e.telegramUsername,
  telegramLinkedAt: e.telegramLinkedAt?.toISOString() ?? null,
  active: e.active,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: ['name', 'email', 'active', 'createdAt', 'updatedAt'],
  filterable: ['id', 'name', 'email', 'active'],
  searchable: true,
};

const CreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().min(1).max(160),
  /** Telegram username (with or without "@"); the developer signs in to the bot with it. */
  telegramUsername: z.string().trim().max(64).nullish(),
  active: z.boolean().optional(),
});
const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().min(1).max(160).optional(),
  telegramUsername: z.string().trim().max(64).nullish(),
  active: z.boolean().optional(),
});

const toInput = <T>(body: T) => body;

export const DeveloperOptionDto = apiSchema(
  'DeveloperOption',
  z.object({
    id: z.uuid(),
    name: z.string(),
    telegramLinked: z.boolean(),
    telegramUsername: z.string().nullable(),
  }),
);

export const TelegramLinkCodeDto = apiSchema(
  'TelegramLinkCode',
  z.object({ code: z.string(), deepLink: z.string().nullable(), expiresAt: isoDateTime() }),
);

/** Product developers API (generated). Writes go through the maker–checker gate. */
@ApiTags('Product developers')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'product-developers', version: '1' })
export class ProductDevelopersController extends BaseController {
  constructor(
    private readonly listProductDevelopers: ListProductDevelopersUseCase,
    private readonly getProductDeveloper: GetProductDeveloperUseCase,
    private readonly createProductDeveloper: CreateProductDeveloperUseCase,
    private readonly updateProductDeveloper: UpdateProductDeveloperUseCase,
    private readonly deleteProductDeveloper: DeleteProductDeveloperUseCase,
    private readonly issueLinkCode: IssueTelegramLinkCodeUseCase,
    private readonly unlinkTelegram: UnlinkTelegramUseCase,
    private readonly developerOptions: ListDeveloperOptionsUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('product-developers:read')
  @ApiOperation({ summary: 'List product developers (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Product developers', ProductDeveloperDto, true)
  async list(
    @ListQuery(LIST_SPEC) request: PageRequest,
  ): Promise<ApiResult<ProductDeveloperDto[]>> {
    return this.paginated(await this.listProductDevelopers.execute(request), toDto);
  }

  @Get('options')
  @RequireAnyPermission(
    'product-developers:read',
    'digital-products:create',
    'digital-products:update',
  )
  @ApiOperation({ summary: 'Active developers (id and name) for the product editor' })
  @ApiEnvelope(200, 'Developers', DeveloperOptionDto, true)
  async options(): Promise<ApiResult<ApiDto<typeof DeveloperOptionDto>[]>> {
    const list = await this.developerOptions.execute();
    return this.ok(
      list.map((d) => ({
        id: d.id,
        name: d.name,
        telegramLinked: !!d.telegramChatId,
        telegramUsername: d.telegramUsername,
      })),
    );
  }

  @Post(':id/telegram-link')
  @HttpCode(201)
  @RequirePermissions('product-developers:update')
  @Audit({
    action: 'PRODUCT_DEVELOPERS_TELEGRAM_LINK_CODE',
    category: 'SECURITY',
    resourceType: 'ProductDeveloper',
  })
  @ApiOperation({
    summary: "Issue a one-time code that links the developer's Telegram (valid 30 minutes)",
    description:
      'The developer sends /start CODE to the bot (or opens the deep link). Only the hash is stored.',
  })
  @ApiEnvelope(201, 'Link code', TelegramLinkCodeDto)
  async telegramLink(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
  ): Promise<ApiResult<ApiDto<typeof TelegramLinkCodeDto>>> {
    const link = await this.issueLinkCode.execute({ principal, id });
    return this.ok({ ...link, expiresAt: link.expiresAt.toISOString() });
  }

  @Delete(':id/telegram-link')
  @RequirePermissions('product-developers:update')
  @Audit({
    action: 'PRODUCT_DEVELOPERS_TELEGRAM_UNLINK',
    category: 'SECURITY',
    resourceType: 'ProductDeveloper',
  })
  @ApiOperation({
    summary: "Disconnect the developer's Telegram (they stop receiving questions there)",
  })
  @ApiEnvelope(200, 'Unlinked', ProductDeveloperDto)
  async telegramUnlink(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
  ): Promise<ApiResult<ProductDeveloperDto>> {
    return this.ok(
      toDto(await this.unlinkTelegram.execute({ principal, id })),
      'Telegram disconnected.',
    );
  }

  @Get(':id')
  @RequirePermissions('product-developers:read')
  @ApiOperation({ summary: 'Get a product developer' })
  @ApiEnvelope(200, 'Product developer', ProductDeveloperDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<ProductDeveloperDto>> {
    return this.ok(toDto(await this.getProductDeveloper.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('product-developers:create')
  @Audit({
    action: 'PRODUCT_DEVELOPERS_CREATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductDeveloper',
  })
  @ApiOperation({ summary: 'Create a product developer; 202 when it needs approval' })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', ProductDeveloperDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductDeveloperDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-developers.create',
      principal,
      payload: body,
      comment: reason,
      execute: () => this.createProductDeveloper.execute({ ...input, principal }),
    });
    return this.gated(outcome, toDto, 'Product developer created.');
  }

  @Patch(':id')
  @RequirePermissions('product-developers:update')
  @Audit({
    action: 'PRODUCT_DEVELOPERS_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductDeveloper',
  })
  @ApiOperation({
    summary:
      'Update a product developer (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', ProductDeveloperDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductDeveloperDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-developers.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () => this.updateProductDeveloper.execute({ ...input, id, principal }),
    });
    return this.gated(outcome, toDto, 'Product developer updated.');
  }

  @Delete(':id')
  @RequirePermissions('product-developers:delete')
  @Audit({
    action: 'PRODUCT_DEVELOPERS_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductDeveloper',
  })
  @ApiOperation({ summary: 'Delete a product developer; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', ProductDeveloperDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductDeveloperDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-developers.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteProductDeveloper.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Product developer deleted.');
  }
}
