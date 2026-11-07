import { Controller, Get, Query } from '@nestjs/common';
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
import type { ApiResult } from '#core/presentation/http/api-response.js';
import {
  apiSchema,
  isoDateTime,
  nullableIsoDateTime,
  type ApiDto,
} from '#core/presentation/openapi/api-schema.js';
import { zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import { AuthenticatedOnly } from '#modules/authorization/presentation/authorization.decorators.js';
import type { AuditRecordView } from '../application/audit-record.repository.js';
import { PersonalActivityUseCase } from '../application/personal-activity.use-case.js';

export const PersonalActivityEntryDto = apiSchema(
  'PersonalActivityEntry',
  z.object({
    id: z.string(),
    occurredAt: isoDateTime(),
    action: z.string(),
    category: z.string(),
    outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED']),
    errorCode: z.string().nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    /** Someone else acted on this account (e.g. an administrator reset the password). */
    byOther: z.boolean(),
    actorUsername: z.string().nullable(),
    resourceType: z.string().nullable(),
    /** Names of the fields that changed (the values stay in the audit trail). */
    changedFields: z.array(z.string()),
  }),
);
type PersonalActivityEntryDto = ApiDto<typeof PersonalActivityEntryDto>;

const PersonalActivityPageDto = apiSchema(
  'PersonalActivityPage',
  z.object({
    items: z.array(PersonalActivityEntryDto.zod),
    /** Pass back as `cursor` to load older entries; null at the end. */
    nextCursor: z.string().nullable(),
  }),
);
type PersonalActivityPageDto = ApiDto<typeof PersonalActivityPageDto>;

const PersonalActivitySummaryDto = apiSchema(
  'PersonalActivitySummary',
  z.object({
    days: z.number().int(),
    signIns: z.number().int(),
    failedSignIns: z.number().int(),
    changes: z.number().int(),
    devices: z.number().int(),
    lastFailedSignInAt: nullableIsoDateTime(),
  }),
);
type PersonalActivitySummaryDto = ApiDto<typeof PersonalActivitySummaryDto>;

const ActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z
    .string()
    .regex(/^\d{1,19}$/)
    .optional(),
});

function changedFields(metadata: Record<string, unknown> | null): string[] {
  const changes = metadata?.['changes'];
  if (!Array.isArray(changes)) return [];
  const names: string[] = [];
  for (const change of changes as Array<{ fields?: Array<{ field?: unknown }> } | null>) {
    for (const f of change?.fields ?? []) {
      if (typeof f.field === 'string' && !names.includes(f.field)) names.push(f.field);
    }
  }
  return names;
}

const toDto =
  (principal: Principal) =>
  (r: AuditRecordView): PersonalActivityEntryDto => ({
    id: r.id,
    occurredAt: r.occurredAt.toISOString(),
    action: r.action,
    category: r.category,
    outcome: r.outcome,
    errorCode: r.errorCode,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    byOther: !!r.actorId && r.actorId !== principal.userId,
    actorUsername: r.actorUsername,
    resourceType: r.resourceType,
    changedFields: changedFields(r.metadata),
  });

/** The signed-in user's own activity (no audit permission required). */
@ApiTags('Account')
@ApiAuth()
@ApiStandardErrors()
@AuthenticatedOnly()
@Controller({ path: 'account/activity', version: '1' })
export class PersonalActivityController extends BaseController {
  constructor(private readonly activity: PersonalActivityUseCase) {
    super();
  }

  @Get()
  @ApiOperation({ summary: 'My recent activity: sign-ins, changes, security events' })
  @ApiEnvelope(200, 'Activity', PersonalActivityPageDto)
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query(zod(ActivityQuery)) query: z.infer<typeof ActivityQuery>,
  ): Promise<ApiResult<PersonalActivityPageDto>> {
    const page = await this.activity.list(principal, {
      limit: query.limit,
      beforeSeq: query.cursor ? BigInt(query.cursor) : null,
    });
    return this.ok({ items: page.items.map(toDto(principal)), nextCursor: page.nextCursor });
  }

  @Get('summary')
  @ApiOperation({ summary: 'My activity figures for the last 30 days' })
  @ApiEnvelope(200, 'Summary', PersonalActivitySummaryDto)
  async summary(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<PersonalActivitySummaryDto>> {
    const s = await this.activity.summary(principal);
    return this.ok({ ...s, lastFailedSignInAt: s.lastFailedSignInAt?.toISOString() ?? null });
  }
}
