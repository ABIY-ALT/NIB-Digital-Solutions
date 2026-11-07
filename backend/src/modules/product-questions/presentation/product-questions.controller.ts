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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import {
  APPROVAL_GATE,
  type ApprovalGate,
  type ApprovalTicket,
} from '#core/application/ports/approval.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { PageRequest } from '#core/domain/pagination.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
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
import { SLUG_PATTERN } from '#modules/marketplace/domain/marketplace.constants.js';
import { assertHuman, visitorHash } from '#modules/marketplace/application/visitor-privacy.js';
import {
  MAX_MESSAGE_LENGTH,
  QUESTION_STATUSES,
  type ProductQuestion,
  type QuestionMessage,
} from '../domain/product-question.entity.js';
import {
  DeleteProductQuestionUseCase,
  GetProductQuestionUseCase,
  ListProductQuestionsUseCase,
  UpdateProductQuestionUseCase,
} from '../application/product-question.use-cases.js';
import { QuestionWorkflow } from '../application/question-workflow.js';
import { TelegramBotService } from '../application/telegram-bot.service.js';

// ── Contract (shared with the frontend through contracts/openapi.json) ──────

export const ProductQuestionDto = apiSchema(
  'ProductQuestion',
  z.object({
    id: z.uuid(),
    reference: z.string(),
    productSlug: z.string(),
    customerName: z.string(),
    customerEmail: z.string(),
    question: z.string(),
    status: z.enum(QUESTION_STATUSES),
    developerId: z.uuid().nullable(),
    lastMessageAt: isoDateTime().nullable(),
    createdAt: isoDateTime(),
    updatedAt: isoDateTime(),
    version: z.int(),
  }),
);
type ProductQuestionDto = ApiDto<typeof ProductQuestionDto>;

const toDto = (e: ProductQuestion): ProductQuestionDto => ({
  id: e.id,
  reference: e.reference,
  productSlug: e.productSlug,
  customerName: e.customerName,
  customerEmail: e.customerEmail,
  question: e.question,
  status: e.status as ProductQuestionDto['status'],
  developerId: e.developerId,
  lastMessageAt: e.lastMessageAt?.toISOString() ?? null,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
  version: e.version,
});

const MessageDto = z.object({
  id: z.uuid(),
  author: z.enum(['customer', 'developer', 'staff']),
  authorName: z.string(),
  channel: z.enum(['web', 'telegram', 'portal']),
  body: z.string(),
  createdAt: isoDateTime(),
});
const toMessage = (m: QuestionMessage): z.infer<typeof MessageDto> => ({
  id: m.id,
  author: m.author,
  authorName: m.authorName,
  channel: m.channel,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

export const QuestionConversationDto = apiSchema(
  'ProductQuestionConversation',
  z.object({
    question: ProductQuestionDto.zod,
    productName: z.string(),
    messages: z.array(MessageDto),
    /** Developers this question is routed to (main / backup). */
    developers: z.array(z.object({ id: z.uuid(), name: z.string(), telegramLinked: z.boolean() })),
    /** Every Telegram notification and e-mail about this question, with its delivery state. */
    deliveries: z.array(
      z.object({
        id: z.uuid(),
        channel: z.enum(['telegram', 'email']),
        status: z.enum(['pending', 'sending', 'sent', 'failed']),
        attempts: z.int(),
        lastError: z.string().nullable(),
        purpose: z.string(),
        createdAt: isoDateTime(),
        sentAt: isoDateTime().nullable(),
      }),
    ),
  }),
);

const LIST_SPEC: ListQuerySpec = {
  sortable: [
    'reference',
    'productSlug',
    'customerName',
    'status',
    'lastMessageAt',
    'createdAt',
    'updatedAt',
  ],
  filterable: ['id', 'reference', 'productSlug', 'customerEmail', 'status', 'developerId'],
  searchable: true,
};

const UpdateSchema = z.strictObject({
  version: z.int().min(1),
  status: z.enum(QUESTION_STATUSES),
});
const ReplySchema = z.strictObject({ body: z.string().trim().min(2).max(MAX_MESSAGE_LENGTH) });

/** "mail-reply:…" → "reply e-mail" (the staff screen labels deliveries by purpose). */
const purposeOf = (dedupeKey: string) =>
  ({
    tg: 'developer-telegram',
    'mail-dev': 'developer-email',
    'mail-ack': 'customer-acknowledgement',
    'mail-reply': 'customer-answer',
  })[dedupeKey.split(':')[0] ?? ''] ?? 'other';

/** Product questions (staff): inbox, conversation, answers, status. */
@ApiTags('Product questions')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'product-questions', version: '1' })
export class ProductQuestionsController extends BaseController {
  constructor(
    private readonly listProductQuestions: ListProductQuestionsUseCase,
    private readonly getProductQuestion: GetProductQuestionUseCase,
    private readonly updateProductQuestion: UpdateProductQuestionUseCase,
    private readonly deleteProductQuestion: DeleteProductQuestionUseCase,
    private readonly workflow: QuestionWorkflow,
    @Inject(APPROVAL_GATE) private readonly approvals: ApprovalGate,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('product-questions:read')
  @ApiOperation({ summary: 'List product questions (paginated, searchable)' })
  @ApiListQuery(LIST_SPEC)
  @ApiEnvelope(200, 'Product questions', ProductQuestionDto, true)
  async list(@ListQuery(LIST_SPEC) request: PageRequest): Promise<ApiResult<ProductQuestionDto[]>> {
    return this.paginated(await this.listProductQuestions.execute(request), toDto);
  }

  @Get(':id')
  @RequirePermissions('product-questions:read')
  @ApiOperation({ summary: 'Get a product question' })
  @ApiEnvelope(200, 'Product question', ProductQuestionDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<ProductQuestionDto>> {
    return this.ok(toDto(await this.getProductQuestion.execute(id)));
  }

  @Get(':id/conversation')
  @RequirePermissions('product-questions:read')
  @ApiOperation({
    summary:
      'The conversation, assigned developers and delivery state of every notification and e-mail',
  })
  @ApiEnvelope(200, 'Conversation', QuestionConversationDto)
  async conversation(
    @Param('id', zod(z.uuid())) id: string,
  ): Promise<ApiResult<ApiDto<typeof QuestionConversationDto>>> {
    const c = await this.workflow.conversationForStaff(id);
    return this.ok({
      question: toDto(c.question),
      productName: c.productName,
      messages: c.messages.map(toMessage),
      developers: c.developers,
      deliveries: c.deliveries.map((d) => ({
        id: d.id,
        channel: d.channel as 'telegram' | 'email',
        status: d.status as 'pending' | 'sending' | 'sent' | 'failed',
        attempts: d.attempts,
        lastError: d.lastError,
        purpose: purposeOf(d.dedupeKey),
        createdAt: d.createdAt.toISOString(),
        sentAt: d.sentAt?.toISOString() ?? null,
      })),
    });
  }

  @Post(':id/replies')
  @HttpCode(201)
  @RequirePermissions('product-questions:update')
  @Audit({
    action: 'PRODUCT_QUESTIONS_REPLY',
    category: 'DATA_CHANGE',
    resourceType: 'ProductQuestion',
  })
  @ApiOperation({ summary: 'Answer from the staff portal (saved and e-mailed to the customer)' })
  @ApiZodBody(ReplySchema)
  @ApiEnvelope(201, 'Answered', ProductQuestionDto)
  async reply(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(ReplySchema)) body: z.infer<typeof ReplySchema>,
  ): Promise<ApiResult<ProductQuestionDto>> {
    const { question } = await this.workflow.staffAnswer(principal, id, body.body);
    return this.ok(toDto(question), 'Answer sent to the customer.');
  }

  @Patch(':id')
  @RequirePermissions('product-questions:update')
  @Audit({
    action: 'PRODUCT_QUESTIONS_UPDATE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductQuestion',
  })
  @ApiOperation({
    summary: 'Change the status (requires the current version); 202 when it needs approval',
  })
  @ApiZodBody(UpdateSchema)
  @ApiChangeReason()
  @ApiEnvelope(200, 'Updated', ProductQuestionDto)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @Body(zod(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductQuestionDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-questions.update',
      principal,
      payload: { ...body, id },
      comment: reason,
      execute: () => this.updateProductQuestion.execute({ ...body, id, principal }),
    });
    return this.gated(outcome, toDto, 'Product question updated.');
  }

  @Delete(':id')
  @RequirePermissions('product-questions:delete')
  @Audit({
    action: 'PRODUCT_QUESTIONS_DELETE',
    category: 'DATA_CHANGE',
    resourceType: 'ProductQuestion',
  })
  @ApiOperation({ summary: 'Delete a product question; 202 when it needs approval' })
  @ApiChangeReason()
  @ApiEnvelope(200, 'Deleted', ProductQuestionDto)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
    @ChangeReason() reason: string | null,
  ): Promise<ApiResult<ProductQuestionDto | ApprovalTicket>> {
    const outcome = await this.approvals.submit({
      action: 'product-questions.delete',
      principal,
      payload: { id },
      comment: reason,
      execute: () => this.deleteProductQuestion.execute({ id, principal }),
    });
    return this.gated(outcome, toDto, 'Product question deleted.');
  }
}

// ── Website: "Ask the developer" ─────────────────────────────────────────────

const TEN_MINUTES = 600_000;
const referenceParam = zod(z.string().regex(/^QST-\d{6}-[A-Z0-9]{5}$/));
const TokenQuery = z.object({ t: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) });

const AskSchema = z.strictObject({
  productSlug: z.string().regex(SLUG_PATTERN).max(80),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().min(1).max(160),
  question: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  meta: z.object({ honeypot: z.string().max(200), elapsedMs: z.int().min(0).max(86_400_000) }),
});
const FollowUpSchema = z.strictObject({
  t: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const QuestionReceivedDto = apiSchema(
  'ProductQuestionReceived',
  z.object({ reference: z.string(), conversationUrl: z.string() }),
);

/** What the customer sees of their conversation (no internal ids or developer details). */
export const PublicConversationDto = apiSchema(
  'PublicQuestionConversation',
  z.object({
    reference: z.string(),
    productSlug: z.string(),
    productName: z.string(),
    customerName: z.string(),
    status: z.enum(QUESTION_STATUSES),
    createdAt: isoDateTime(),
    messages: z.array(
      z.object({
        author: z.enum(['customer', 'developer', 'staff']),
        authorName: z.string(),
        body: z.string(),
        createdAt: isoDateTime(),
      }),
    ),
  }),
);
type PublicConversation = ApiDto<typeof PublicConversationDto>;

@ApiTags('Marketplace (public)')
@ApiStandardErrors()
@Public()
@Controller({ path: 'marketplace/questions', version: '1' })
export class PublicQuestionsController extends BaseController {
  constructor(
    private readonly workflow: QuestionWorkflow,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  private view(c: {
    question: ProductQuestion;
    productName: string;
    messages: QuestionMessage[];
  }): PublicConversation {
    return {
      reference: c.question.reference,
      productSlug: c.question.productSlug,
      productName: c.productName,
      customerName: c.question.customerName,
      status: c.question.status as PublicConversation['status'],
      createdAt: c.question.createdAt.toISOString(),
      messages: c.messages.map((m) => ({
        author: m.author,
        // Developers are shown by first name only.
        authorName:
          m.author === 'customer' ? m.authorName : (m.authorName.split(/\s+/)[0] ?? m.authorName),
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: TEN_MINUTES } })
  @Audit({
    action: 'PRODUCT_QUESTION_SUBMITTED',
    category: 'DATA_CHANGE',
    resourceType: 'ProductQuestion',
  })
  @ApiOperation({ summary: 'Ask the developer of a product (routed to them; answer by e-mail)' })
  @ApiZodBody(AskSchema)
  @ApiEnvelope(201, 'Received', QuestionReceivedDto)
  async ask(
    @Body(zod(AskSchema)) body: z.infer<typeof AskSchema>,
  ): Promise<ApiResult<ApiDto<typeof QuestionReceivedDto>>> {
    assertHuman(body.meta);
    const ip = RequestContext.get()?.ipAddress ?? 'unknown';
    const { question, conversationUrl } = await this.workflow.submit({
      productSlug: body.productSlug,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      question: body.question,
      ipHash: visitorHash(this.config.marketplace.privacySalt, `ip:${ip}`),
    });
    return this.ok(
      { reference: question.reference, conversationUrl },
      'Your question was sent to the developer.',
    );
  }

  @Get(':reference')
  @Throttle({ default: { limit: 60, ttl: TEN_MINUTES } })
  @ApiOperation({
    summary: "The customer's conversation (reference + private token from the e-mail)",
  })
  @ApiEnvelope(200, 'Conversation', PublicConversationDto)
  async conversation(
    @Param('reference', referenceParam) reference: string,
    @Query(zod(TokenQuery)) query: z.infer<typeof TokenQuery>,
  ): Promise<ApiResult<PublicConversation>> {
    return this.ok(this.view(await this.workflow.conversationForCustomer(reference, query.t)));
  }

  @Post(':reference/messages')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: TEN_MINUTES } })
  @Audit({
    action: 'PRODUCT_QUESTION_FOLLOW_UP',
    category: 'DATA_CHANGE',
    resourceType: 'ProductQuestion',
  })
  @ApiOperation({ summary: 'A follow-up from the customer (the developer is notified)' })
  @ApiZodBody(FollowUpSchema)
  @ApiEnvelope(201, 'Sent', PublicConversationDto)
  async followUp(
    @Param('reference', referenceParam) reference: string,
    @Body(zod(FollowUpSchema)) body: z.infer<typeof FollowUpSchema>,
  ): Promise<ApiResult<PublicConversation>> {
    return this.ok(
      this.view(await this.workflow.followUp(reference, body.t, body.body)),
      'Message sent.',
    );
  }
}

// ── Telegram updates (forwarded by the website BFF after it checked the secret token) ──

const UpdateBody = z
  .object({ update_id: z.int().min(0) })
  .passthrough()
  .refine((u) => JSON.stringify(u).length < 64_000, 'Update too large');

@ApiTags('Telegram')
@ApiStandardErrors()
@Public()
@Controller({ path: 'telegram', version: '1' })
export class TelegramUpdatesController extends BaseController {
  constructor(
    private readonly bot: TelegramBotService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  @Post('updates')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({
    summary: 'A Telegram update (webhook mode)',
    description:
      'Telegram posts to the website (/api/telegram/webhook), which verifies X-Telegram-Bot-Api-Secret-Token and forwards here with the BFF service signature.',
  })
  @ApiEnvelope(200, 'Accepted')
  async update(@Body(zod(UpdateBody)) body: z.infer<typeof UpdateBody>): Promise<ApiResult<null>> {
    if (this.config.telegram.mode === 'webhook') await this.bot.handle(body);
    return this.ok(null);
  }
}
