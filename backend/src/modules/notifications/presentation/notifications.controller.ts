import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Principal } from '#core/application/security/principal.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit } from '#core/presentation/decorators/metadata.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import {
  apiSchema,
  isoDateTime,
  nullableIsoDateTime,
  type ApiDto,
} from '#core/presentation/openapi/api-schema.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import {
  AuthenticatedOnly,
  RequirePermissions,
} from '#modules/authorization/presentation/authorization.decorators.js';
import {
  BroadcastAnnouncementUseCase,
  NotificationInboxUseCases,
  NotificationPreferencesUseCases,
} from '../application/notification.use-cases.js';
import {
  NOTIFICATION_ACTIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_FOLDERS,
  type NotificationRecord,
} from '../domain/notification.js';

// ── Contract ─────────────────────────────────────────────────────────────────

const severity = z.enum(['INFO', 'SUCCESS', 'WARNING', 'CRITICAL']);

export const NotificationDto = apiSchema(
  'Notification',
  z.object({
    id: z.uuid(),
    createdAt: isoDateTime(),
    category: z.string(),
    severity,
    template: z.string(),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).nullable(),
    title: z.string(),
    body: z.string(),
    link: z.string().nullable(),
    senderName: z.string().nullable(),
    threadKey: z.string().nullable(),
    read: z.boolean(),
    starred: z.boolean(),
    archived: z.boolean(),
    trashed: z.boolean(),
    readAt: nullableIsoDateTime(),
  }),
);
type NotificationDto = ApiDto<typeof NotificationDto>;

const counter = z.object({ total: z.int(), unread: z.int() });
export const NotificationSummaryDto = apiSchema(
  'NotificationSummary',
  z.object({
    inbox: z.int(),
    unread: z.int(),
    starred: z.int(),
    archived: z.int(),
    trash: z.int(),
    categories: z.record(z.string(), counter),
    latest: z.array(NotificationDto.zod),
  }),
);
type NotificationSummaryDto = ApiDto<typeof NotificationSummaryDto>;

export const NotificationPreferenceDto = apiSchema(
  'NotificationPreference',
  z.object({
    category: z.enum(NOTIFICATION_CATEGORIES),
    inApp: z.boolean(),
    email: z.boolean(),
    inAppLocked: z.boolean(),
  }),
);
type NotificationPreferenceDto = ApiDto<typeof NotificationPreferenceDto>;

const toDto = (n: NotificationRecord): NotificationDto => ({
  id: n.id,
  createdAt: n.createdAt.toISOString(),
  category: n.category,
  severity: n.severity,
  template: n.template,
  params: n.params,
  title: n.title,
  body: n.body,
  link: n.link,
  senderName: n.senderName,
  threadKey: n.threadKey,
  read: n.readAt !== null,
  starred: n.starredAt !== null,
  archived: n.archivedAt !== null,
  trashed: n.deletedAt !== null,
  readAt: n.readAt?.toISOString() ?? null,
});

// ── Requests ─────────────────────────────────────────────────────────────────

const ListSchema = z.object({
  folder: z.enum(NOTIFICATION_FOLDERS).default('inbox'),
  category: z.string().trim().max(32).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const ActionSchema = z.union([
  z.strictObject({
    action: z.enum(NOTIFICATION_ACTIONS),
    ids: z.array(z.uuid()).min(1).max(500),
  }),
  z.strictObject({
    action: z.enum(NOTIFICATION_ACTIONS),
    folder: z.enum(NOTIFICATION_FOLDERS),
    category: z.string().trim().max(32).optional(),
  }),
]);

const PreferencesSchema = z.strictObject({
  preferences: z
    .array(
      z.strictObject({
        category: z.enum(NOTIFICATION_CATEGORIES),
        inApp: z.boolean(),
        email: z.boolean(),
      }),
    )
    .max(20),
});

const BroadcastSchema = z.strictObject({
  audience: z.enum(['ALL', 'ROLES']),
  roles: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('INFO'),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(2000),
  link: z
    .string()
    .trim()
    .regex(/^\/[^/\\]/, 'Use an in-app path such as /approvals')
    .max(300)
    .nullish(),
});

/**
 * The signed-in user's notification inbox (Gmail-style folders, stars,
 * archive, trash, bulk actions) plus channel preferences and announcements.
 */
@ApiTags('Notifications')
@ApiAuth()
@ApiStandardErrors()
@AuthenticatedOnly()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController extends BaseController {
  constructor(
    private readonly inbox: NotificationInboxUseCases,
    private readonly preferencesUseCases: NotificationPreferencesUseCases,
    private readonly broadcastUseCase: BroadcastAnnouncementUseCase,
  ) {
    super();
  }

  @Get()
  @ApiOperation({ summary: 'List my notifications (folder, category, search, paging)' })
  @ApiEnvelope(200, 'Notifications', NotificationDto, true)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query(zod(ListSchema)) query: z.infer<typeof ListSchema>,
  ): Promise<ApiResult<NotificationDto[]>> {
    return this.paginated(await this.inbox.list(principal, query), toDto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Counters per folder/category and the latest messages (bell menu)' })
  @ApiEnvelope(200, 'Summary', NotificationSummaryDto)
  async summary(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<NotificationSummaryDto>> {
    const { counts, latest } = await this.inbox.summary(principal);
    return this.ok({ ...counts, latest: latest.map(toDto) });
  }

  @Get('preferences')
  @ApiOperation({ summary: 'My delivery channels per category' })
  @ApiEnvelope(200, 'Preferences', { type: 'array', items: NotificationPreferenceDto.ref })
  async preferences(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<NotificationPreferenceDto[]>> {
    return this.ok(await this.preferencesUseCases.get(principal));
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Save my delivery channels (security alerts stay on in-app)' })
  @ApiZodBody(PreferencesSchema)
  @ApiEnvelope(200, 'Preferences', { type: 'array', items: NotificationPreferenceDto.ref })
  async savePreferences(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(PreferencesSchema)) body: z.infer<typeof PreferencesSchema>,
  ): Promise<ApiResult<NotificationPreferenceDto[]>> {
    return this.ok(
      await this.preferencesUseCases.save(principal, body.preferences),
      'Notification settings saved.',
    );
  }

  @Post('actions')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Bulk action: read, unread, star, unstar, archive, unarchive, trash, restore, delete',
  })
  @ApiZodBody(ActionSchema)
  @ApiEnvelope(200, 'Affected messages')
  async act(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(ActionSchema)) body: z.infer<typeof ActionSchema>,
  ): Promise<ApiResult<{ affected: number }>> {
    const target =
      'ids' in body ? { ids: body.ids } : { folder: body.folder, category: body.category };
    return this.ok({ affected: await this.inbox.apply(principal, target, body.action) });
  }

  @Post('broadcast')
  @HttpCode(200)
  @RequirePermissions('notifications:broadcast')
  @Audit({
    action: 'NOTIFICATION_BROADCAST',
    category: 'DATA_CHANGE',
    resourceType: 'Announcement',
    metadata: (req, data) => ({
      audience: (req.body as { audience?: string }).audience,
      recipients: (data as { recipients?: number } | undefined)?.recipients,
    }),
  })
  @ApiOperation({ summary: 'Send an announcement to everyone or to selected roles' })
  @ApiZodBody(BroadcastSchema)
  @ApiEnvelope(200, 'Recipients')
  async broadcast(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(BroadcastSchema)) body: z.infer<typeof BroadcastSchema>,
  ): Promise<ApiResult<{ recipients: number }>> {
    const result = await this.broadcastUseCase.execute(principal, body);
    return this.ok(result, `Announcement sent to ${result.recipients} people.`);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my notifications' })
  @ApiEnvelope(200, 'Notification', NotificationDto)
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', zod(z.uuid())) id: string,
  ): Promise<ApiResult<NotificationDto>> {
    return this.ok(toDto(await this.inbox.get(principal, id)));
  }
}
