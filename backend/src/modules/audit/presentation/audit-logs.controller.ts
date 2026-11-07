import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuditChange } from '#core/domain/audit-change.js';
import type { PageRequest } from '#core/domain/pagination.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import { apiSchema, isoDateTime, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import {
  ApiListQuery,
  ListQuery,
  type ListQuerySpec,
} from '#core/presentation/pagination/list-query.js';
import { zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import { RequirePermissions } from '#modules/authorization/presentation/authorization.decorators.js';
import type {
  AuditActivitySummary,
  AuditFacets,
  AuditRecordView,
} from '../application/audit-record.repository.js';
import {
  AuditActivityUseCase,
  GetAuditLogUseCase,
  ListAuditLogsUseCase,
} from '../application/list-audit-logs.use-case.js';

const AUDIT_LIST_SPEC: ListQuerySpec = {
  sortable: ['occurredAt', 'action', 'outcome', 'seq'],
  filterable: [
    'id',
    'seq',
    'action',
    'actorUsername',
    'ipAddress',
    'category',
    'outcome',
    'actorId',
    'resourceType',
    'resourceId',
    'correlationId',
    'occurredAt',
  ],
  searchable: true,
  maxPageSize: 200,
};

const AuditChangeDto = apiSchema(
  'AuditChange',
  z.object({
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    operation: z.enum(['create', 'update', 'delete', 'restore']),
    /** Submitted for maker–checker approval, not applied yet. */
    proposed: z.boolean().optional(),
    fields: z.array(
      z.object({
        field: z.string(),
        before: z.unknown(),
        after: z.unknown(),
        /** Secret value withheld: only the fact that it changed is recorded. */
        redacted: z.boolean().optional(),
      }),
    ),
  }),
);

export const AuditLogDto = apiSchema(
  'AuditLog',
  z.object({
    id: z.string(),
    /** Position in the tamper-evident chain. */
    seq: z.string(),
    /** Hash of the previous record: the link this record is sealed to. */
    prevHash: z.string().nullable(),
    /** HMAC chain hash (null only while a legacy record awaits sealing). */
    hash: z.string().nullable(),
    occurredAt: isoDateTime(),
    actorId: z.string().nullable(),
    actorUsername: z.string().nullable(),
    action: z.string(),
    category: z.enum([
      'AUTHENTICATION',
      'AUTHORIZATION',
      'DATA_ACCESS',
      'DATA_CHANGE',
      'FINANCIAL',
      'SECURITY',
      'SYSTEM',
    ]),
    resourceType: z.string().nullable(),
    resourceId: z.string().nullable(),
    outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED']),
    errorCode: z.string().nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    correlationId: z.string().nullable(),
    /** Field-level previous and new values of what the action changed. */
    changes: z.array(AuditChangeDto.zod),
    /** Other context recorded with the event (changes excluded). */
    metadata: z.record(z.string(), z.unknown()).nullable(),
  }),
);
type AuditLogDto = ApiDto<typeof AuditLogDto>;

const AuditActivityDto = apiSchema(
  'AuditActivity',
  z.object({
    total: z.number().int(),
    failures: z.number().int(),
    denied: z.number().int(),
    distinctActors: z.number().int(),
    byCategory: z.array(z.object({ category: z.string(), count: z.number().int() })),
    topActions: z.array(z.object({ action: z.string(), count: z.number().int() })),
  }),
);

const AuditFacetsDto = apiSchema(
  'AuditFacets',
  z.object({
    actions: z.array(z.object({ action: z.string(), count: z.number().int() })),
    resourceTypes: z.array(z.string()),
  }),
);

const ActivityQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

/** Splits the recorded `metadata.changes` into the typed `changes` field. */
function splitMetadata(metadata: Record<string, unknown> | null): {
  changes: AuditChange[];
  metadata: Record<string, unknown> | null;
} {
  if (!metadata || !Array.isArray(metadata['changes'])) return { changes: [], metadata };
  const { changes, ...rest } = metadata;
  return {
    changes: changes as AuditChange[],
    metadata: Object.keys(rest).length > 0 ? rest : null,
  };
}

const toDto = (r: AuditRecordView): AuditLogDto => ({
  id: r.id,
  seq: r.seq.toString(),
  prevHash: r.prevHash,
  hash: r.hash,
  occurredAt: r.occurredAt.toISOString(),
  actorId: r.actorId,
  actorUsername: r.actorUsername,
  action: r.action,
  category: r.category,
  resourceType: r.resourceType,
  resourceId: r.resourceId,
  outcome: r.outcome,
  errorCode: r.errorCode,
  ipAddress: r.ipAddress,
  userAgent: r.userAgent,
  correlationId: r.correlationId,
  ...splitMetadata(r.metadata),
});

@ApiTags('Audit')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'audit-logs', version: '1' })
export class AuditLogsController extends BaseController {
  constructor(
    private readonly listAuditLogs: ListAuditLogsUseCase,
    private readonly getAuditLog: GetAuditLogUseCase,
    private readonly activity: AuditActivityUseCase,
  ) {
    super();
  }

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'List audit records (paginated, filterable, searchable)' })
  @ApiListQuery(AUDIT_LIST_SPEC)
  @ApiEnvelope(200, 'Audit records', AuditLogDto, true)
  async list(@ListQuery(AUDIT_LIST_SPEC) query: PageRequest): Promise<ApiResult<AuditLogDto[]>> {
    return this.paginated(await this.listAuditLogs.execute(query), toDto);
  }

  @Get('activity')
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Activity summary for a time window (totals, failures, top actions)' })
  @ApiEnvelope(200, 'Activity summary', AuditActivityDto)
  async summary(
    @Query(zod(ActivityQuery)) query: z.infer<typeof ActivityQuery>,
  ): Promise<ApiResult<AuditActivitySummary>> {
    return this.ok(
      await this.activity.summary(
        query.from ? new Date(query.from) : null,
        query.to ? new Date(query.to) : null,
      ),
    );
  }

  @Get('facets')
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Recorded actions and resource types (for filter pickers)' })
  @ApiEnvelope(200, 'Facets', AuditFacetsDto)
  async facets(): Promise<ApiResult<AuditFacets>> {
    return this.ok(await this.activity.facets());
  }

  @Get(':id')
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Get one audit record with its changes and chain link' })
  @ApiEnvelope(200, 'Audit record', AuditLogDto)
  async get(@Param('id', zod(z.uuid())) id: string): Promise<ApiResult<AuditLogDto>> {
    return this.ok(toDto(await this.getAuditLog.execute(id)));
  }
}
