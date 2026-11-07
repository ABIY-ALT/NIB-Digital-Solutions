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
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import { assertHuman, visitorHash } from '#modules/marketplace/application/visitor-privacy.js';
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
import { IDEA_STATUSES, type ProductIdea } from '../domain/product-idea.entity.js';
import {
  ListPublicProductIdeasUseCase,
  SubmitProductIdeaUseCase,
  VoteProductIdeaUseCase,
  CreateProductIdeaUseCase,
  DeleteProductIdeaUseCase,
  GetProductIdeaUseCase,
  ListProductIdeasUseCase,
  UpdateProductIdeaUseCase,
} from '../application/product-idea.use-cases.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const ProductIdeaDto = apiSchema(
  'ProductIdea',
  z.object({
    id: z.uuid(),
    reference: z.string(),
    title: z.string(),
    problem: z.string(),
    categoryCode: z.string().nullable(),
    submitterName: z.string().nullable(),
    submitterEmail: z.string(),
    status: z.enum(IDEA_STATUSES),
    voteCount: z.int(),
    adminNote: z.string().nullable(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type ProductIdeaDto = ApiDto<typeof ProductIdeaDto>;

const toDto = (e: ProductIdea): ProductIdeaDto => ({
  id: e.id,
  reference: e.reference,
  title: e.title,
  problem: e.problem,
  categoryCode: e.categoryCode,
  submitterName: e.submitterName,
  submitterEmail: e.submitterEmail,
  status: e.status as ProductIdeaDto['status'],
  voteCount: e.voteCount,
  adminNote: e.adminNote,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const LIST_SPEC: ListQuerySpec = {
  sortable: [
    'reference',
    'title',
    'categoryCode',
    'submitterName',
    'submitterEmail',
    'status',
    'voteCount',
    'createdAt',
    'updatedAt',
  ],
  filterable: [
    'id',
    'reference',
    'title',
    'categoryCode',
    'submitterName',
    'submitterEmail',
    'status',
    'voteCount',
  ],
  searchable: true,
};

const CreateSchema = z.strictObject({
  reference: z.string().trim().max(40).nullish(),
  title: z.string().trim().min(1).max(160),
  problem: z.string().trim().min(1).max(2000),
  categoryCode: z.string().trim().max(60).nullish(),
  submitterName: z.string().trim().max(120).nullish(),
  submitterEmail: z.string().trim().min(1).max(160),
  status: z.enum(IDEA_STATUSES),
  adminNote: z.string().trim().max(2000).nullish(),
});
const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  title: z.string().trim().min(1).max(160).optional(),
  problem: z.string().trim().min(1).max(2000).optional(),
  categoryCode: z.string().trim().max(60).nullish(),
  submitterName: z.string().trim().max(120).nullish(),
  submitterEmail: z.string().trim().min(1).max(160).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  adminNote: z.string().trim().max(2000).nullish(),
});

const toInput = <T>(body: T) => body;

/** Product ideas API (generated). Writes go through the maker–checker gate. */
@ApiTags('Product ideas')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'product-ideas', version: '1' })
export class ProductIdeasController extends BaseController {
  constructor(
    private readonly listProductIdeas: ListProductIdeasUseCase,
    private readonly getProductIdea: GetProductIdeaUseCase,
    private readonly createProductIdea: CreateProductIdeaUseCase,
    private readonly updateProductIdea: UpdateProductIdeaUseCase,
    private readonly deleteProductIdea: DeleteProductIdeaUseCase,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('product-ideas:read')
  @ApiOperation({ summary: 'List product ideas (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Product ideas', ProductIdeaDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<ProductIdeaDto[]>> {
    return this.paginated(await this.listProductIdeas.execute(request), toDto);
  }

  @Get(':id')
  @RequirePermissions('product-ideas:read')
  @ApiOperation({ summary: 'Get a product idea' })
  @ApiEnvelope(200, 'Product idea', ProductIdeaDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<ProductIdeaDto>> {
    return this.ok(toDto(await this.getProductIdea.execute(id)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('product-ideas:create')
  @Audit({ action: 'PRODUCT_IDEAS_CREATE', category: 'DATA_CHANGE', resourceType: 'ProductIdea' })
  @ApiOperation({ summary: 'Create a product idea; 202 when it needs approval' })
  @ApiZodBody(CreateSchema)
  @ApiChangeReason()
  @ApiEnvelope(201, 'Created', ProductIdeaDto)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(CreateSchema)) body: z.infer<typeof CreateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductIdeaDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-ideas.create',
      principal,
      payload: body,
      comment: reason,
      execute: () => this.createProductIdea.execute({ ...input, principal }),
    });
    return this.gated(outcome, toDto, 'Product idea created.');
  }

  @Patch(':id')
  @RequirePermissions('product-ideas:update')
  @Audit({ action: 'PRODUCT_IDEAS_UPDATE', category: 'DATA_CHANGE', resourceType: 'ProductIdea' })
  @ApiOperation({
    summary: 'Update a product idea (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', ProductIdeaDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductIdeaDto | ApprovalTicket>> {
    const input = toInput(body);
    const outcome = await this.approvals.submit({
      action: 'product-ideas.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () => this.updateProductIdea.execute({ ...input, id, principal }),
    });
    return this.gated(outcome, toDto, 'Product idea updated.');
  }

  @Delete(':id')
  @RequirePermissions('product-ideas:delete')
  @Audit({ action: 'PRODUCT_IDEAS_DELETE', category: 'DATA_CHANGE', resourceType: 'ProductIdea' })
  @ApiOperation({ summary: 'Delete a product idea; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', ProductIdeaDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductIdeaDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-ideas.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteProductIdea.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Product idea deleted.');
  }
}

// ── Public idea board (website) ─────────────────────────────────────────────

const TEN_MINUTES = 600_000;
const voterToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);

export const PublicIdeaDto = apiSchema(
  'PublicIdea',
  z.object({
    reference: z.string(),
    title: z.string(),
    problem: z.string(),
    categoryCode: z.string().nullable(),
    /** First name the visitor chose to give, if any (never the e-mail). */
    suggestedBy: z.string().nullable(),
    status: z.enum(IDEA_STATUSES),
    voteCount: z.int(),
    /** Whether this visitor already voted for it. */
    voted: z.boolean(),
    votable: z.boolean(),
    createdAt: isoDateTime(),
  }),
);
type PublicIdea = ApiDto<typeof PublicIdeaDto>;

const toPublicIdea = (e: ProductIdea, voted: boolean): PublicIdea => ({
  reference: e.reference,
  title: e.title,
  problem: e.problem,
  categoryCode: e.categoryCode,
  suggestedBy: e.submitterName?.split(/\s+/)[0] ?? null,
  status: e.status as PublicIdea['status'],
  voteCount: e.voteCount,
  voted,
  votable: e.isVotable,
  createdAt: e.createdAt.toISOString(),
});

const PublicListQuery = z.object({
  sort: z.enum(['popular', 'newest']).default('popular'),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  status: z.enum(['approved', 'in_development', 'completed']).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(30),
  /** The visitor's anonymous voter token (from the website's cookie), to mark their votes. */
  voter: voterToken.optional(),
});

const SubmitIdeaSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  problem: z.string().trim().min(1).max(2000),
  categoryCode: z.string().trim().max(60).nullish(),
  submitterName: z.string().trim().max(120).nullish(),
  submitterEmail: z.string().trim().min(1).max(160),
  meta: z.object({ honeypot: z.string().max(200), elapsedMs: z.int().min(0).max(86_400_000) }),
});

const VoteSchema = z.strictObject({ voterToken });

export const IdeaSubmittedDto = apiSchema('IdeaSubmitted', z.object({ reference: z.string() }));

/**
 * "What should we build next?": the public idea board. Visitors suggest
 * products (moderated before they appear), browse approved ideas and vote once
 * per idea. Rate limited per visitor IP; IPs and voter tokens are only stored
 * as keyed hashes.
 */
@ApiTags('Marketplace (public)')
@ApiStandardErrors()
@Public()
@Controller({ path: 'marketplace/ideas', version: '1' })
export class PublicIdeasController extends BaseController {
  constructor(
    private readonly listPublic: ListPublicProductIdeasUseCase,
    private readonly submitIdea: SubmitProductIdeaUseCase,
    private readonly voteIdea: VoteProductIdeaUseCase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  private hash(value: string): string {
    return visitorHash(this.config.marketplace.privacySalt, value);
  }

  private ipHash(): string {
    return this.hash(`ip:${RequestContext.get()?.ipAddress ?? 'unknown'}`);
  }

  @Get()
  @ApiOperation({
    summary: "Approved ideas (popular or newest first), with the visitor's votes marked",
  })
  @ApiEnvelope(200, 'Ideas', PublicIdeaDto, true)
  async list(
    @Query(zod(PublicListQuery)) query: z.infer<typeof PublicListQuery>,
  ): Promise<ApiResult<PublicIdea[]>> {
    const { ideas, voted } = await this.listPublic.execute(
      {
        sort: query.sort,
        category: query.category,
        status: query.status,
        search: query.q,
        limit: query.limit,
      },
      query.voter ? this.hash(`voter:${query.voter}`) : null,
    );
    return this.ok(ideas.map((i) => toPublicIdea(i, voted.has(i.id))));
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: TEN_MINUTES } })
  @Audit({ action: 'PRODUCT_IDEA_SUBMITTED', category: 'DATA_CHANGE', resourceType: 'ProductIdea' })
  @ApiOperation({ summary: 'Suggest a product (reviewed by staff before it is published)' })
  @ApiZodBody(SubmitIdeaSchema)
  @ApiEnvelope(201, 'Received', IdeaSubmittedDto)
  async submit(
    @Body(zod(SubmitIdeaSchema)) body: z.infer<typeof SubmitIdeaSchema>,
  ): Promise<ApiResult<{ reference: string }>> {
    assertHuman(body.meta);
    const { meta: _meta, ...input } = body;
    const idea = await this.submitIdea.execute({ ...input, ipHash: this.ipHash() });
    return this.ok({ reference: idea.reference }, 'Thank you! We will review your idea.');
  }

  @Post(':reference/vote')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: TEN_MINUTES } })
  @ApiOperation({ summary: 'Vote for an idea (once per visitor)' })
  @ApiZodBody(VoteSchema)
  @ApiEnvelope(200, 'Voted', PublicIdeaDto)
  async vote(
    @Param('reference', zod(z.string().regex(/^IDEA-\d{6}-[A-Z0-9]{5}$/))) reference: string,
    @Body(zod(VoteSchema)) body: z.infer<typeof VoteSchema>,
  ): Promise<ApiResult<PublicIdea>> {
    const { idea, outcome } = await this.voteIdea.execute({
      reference,
      voterHash: this.hash(`voter:${body.voterToken}`),
      ipHash: this.ipHash(),
    });
    return this.ok(
      toPublicIdea(idea, true),
      outcome === 'counted' ? 'Thank you for voting.' : 'You already voted for this idea.',
    );
  }
}
