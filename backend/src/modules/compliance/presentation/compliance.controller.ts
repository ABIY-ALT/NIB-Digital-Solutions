import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { NotFoundError } from '#core/domain/errors/app-error.js';
import { BaseController } from '#core/presentation/base.controller.js';
import {
  ApiAuth,
  ApiEnvelope,
  ApiStandardErrors,
} from '#core/presentation/decorators/api-docs.decorators.js';
import { CurrentPrincipal } from '#core/presentation/decorators/current-principal.decorator.js';
import { Audit } from '#core/presentation/decorators/metadata.decorators.js';
import { AuthRateLimit } from '#core/presentation/decorators/rate-limit.decorators.js';
import type { ApiResult } from '#core/presentation/http/api-response.js';
import {
  apiSchema,
  isoDateTime,
  nullableIsoDateTime,
  type ApiDto,
} from '#core/presentation/openapi/api-schema.js';
import { ApiZodBody, zod } from '#core/presentation/pipes/zod-validation.pipe.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { AuditIntegrityService } from '#modules/audit/application/audit-integrity.service.js';
import {
  AUDIT_RECORD_REPOSITORY,
  type AuditCheckpoint,
  type AuditRecordRepository,
} from '#modules/audit/application/audit-record.repository.js';
import { RequirePermissions } from '#modules/authorization/presentation/authorization.decorators.js';
import { SECURITY_POLICY } from '#modules/users/application/password-policy.service.js';
import type { SecurityPolicy } from '#modules/users/domain/password-policy.js';
import { RetentionService, type RetentionRunRecord } from '../application/retention.service.js';

// ── Contract ─────────────────────────────────────────────────────────────────

const policyResult = z.object({
  policy: z.string(),
  dataset: z.string(),
  retentionDays: z.int(),
  cutoff: isoDateTime(),
  matched: z.int(),
  purged: z.int(),
  archived: z.int(),
  archiveRef: z.string().nullable(),
  notes: z.string().nullable(),
  error: z.string().nullable(),
});

export const RetentionRunDto = apiSchema(
  'RetentionRun',
  z.object({
    id: z.uuid(),
    startedAt: isoDateTime(),
    finishedAt: nullableIsoDateTime(),
    trigger: z.enum(['SCHEDULED', 'MANUAL']),
    dryRun: z.boolean(),
    status: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED']),
    triggeredBy: z.string().nullable(),
    results: z.array(policyResult),
  }),
);
type RetentionRunDto = ApiDto<typeof RetentionRunDto>;

export const AuditCheckpointDto = apiSchema(
  'AuditCheckpoint',
  z.object({
    id: z.uuid(),
    createdAt: isoDateTime(),
    kind: z.enum(['ANCHOR', 'PURGE']),
    seq: z.string(),
    hash: z.string(),
    fromSeq: z.string().nullable(),
    recordCount: z.int(),
    archiveRef: z.string().nullable(),
    createdBy: z.string().nullable(),
  }),
);
type AuditCheckpointDto = ApiDto<typeof AuditCheckpointDto>;

export const IntegrityReportDto = apiSchema(
  'AuditIntegrityReport',
  z.object({
    status: z.enum(['INTACT', 'BROKEN', 'EMPTY']),
    verifiedAt: isoDateTime(),
    durationMs: z.int(),
    checked: z.int(),
    firstSeq: z.string().nullable(),
    lastSeq: z.string().nullable(),
    headHash: z.string().nullable(),
    startsAfterPurge: z.object({ seq: z.string(), archiveRef: z.string().nullable() }).nullable(),
    anchorsChecked: z.int(),
    break: z
      .object({
        seq: z.string(),
        id: z.string().nullable(),
        reason: z.enum(['UNSEALED', 'CHAIN_BROKEN', 'HASH_MISMATCH', 'ANCHOR_MISMATCH']),
      })
      .nullable(),
  }),
);
type IntegrityReportDto = ApiDto<typeof IntegrityReportDto>;

const job = z.object({
  name: z.string(),
  everyMs: z.int(),
  lastStartedAt: nullableIsoDateTime(),
  lastFinishedAt: nullableIsoDateTime(),
  lastStatus: z.enum(['success', 'failed', 'skipped']).nullable(),
  lastError: z.string().nullable(),
  nextRunAt: nullableIsoDateTime(),
});

export const ComplianceOverviewDto = apiSchema(
  'ComplianceOverview',
  z.object({
    password: z.object({
      minLength: z.int(),
      requireUppercase: z.boolean(),
      requireLowercase: z.boolean(),
      requireDigit: z.boolean(),
      requireSymbol: z.boolean(),
      historyCount: z.int(),
      maxAgeDays: z.int(),
      minAgeHours: z.int(),
      expiryWarningDays: z.int(),
      changeOnFirstLogin: z.boolean(),
    }),
    lockout: z.object({ maxFailedAttempts: z.int(), lockoutMinutes: z.int() }),
    session: z.object({
      idleTimeoutMinutes: z.int(),
      absoluteHours: z.number(),
      maxConcurrent: z.int(),
      newDeviceAlerts: z.boolean(),
    }),
    mfa: z.object({ requiredRoles: z.array(z.string()) }),
    retention: z.object({
      enabled: z.boolean(),
      intervalHours: z.int(),
      policies: z.array(
        z.object({
          id: z.string(),
          dataset: z.string(),
          description: z.string(),
          retentionDays: z.int(),
          archive: z.boolean(),
          basis: z.string().nullable(),
        }),
      ),
    }),
    audit: z.object({
      total: z.int(),
      unsealed: z.int(),
      firstSeq: z.string().nullable(),
      lastSeq: z.string().nullable(),
      oldest: nullableIsoDateTime(),
      newest: nullableIsoDateTime(),
      headHash: z.string().nullable(),
      keyConfigured: z.boolean(),
    }),
    jobs: z.array(job),
  }),
);
type ComplianceOverviewDto = ApiDto<typeof ComplianceOverviewDto>;

const runDto = (r: RetentionRunRecord): RetentionRunDto => ({
  id: r.id,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
  trigger: r.trigger,
  dryRun: r.dryRun,
  status: r.status,
  triggeredBy: r.triggeredBy,
  results: r.results,
});

const checkpointDto = (c: AuditCheckpoint): AuditCheckpointDto => ({
  id: c.id,
  createdAt: c.createdAt.toISOString(),
  kind: c.kind,
  seq: c.seq.toString(),
  hash: c.hash,
  fromSeq: c.fromSeq?.toString() ?? null,
  recordCount: c.recordCount,
  archiveRef: c.archiveRef,
  createdBy: c.createdBy,
});

const iso = (d: Date | null) => d?.toISOString() ?? null;

const RunSchema = z.strictObject({ dryRun: z.boolean().default(false) });
const PageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * Security & compliance console: effective policies, tamper-evidence of the
 * audit trail, data retention (preview, run, history) and background jobs.
 */
@ApiTags('Compliance')
@ApiAuth()
@ApiStandardErrors()
@Controller({ path: 'compliance', version: '1' })
export class ComplianceController extends BaseController {
  constructor(
    private readonly retention: RetentionService,
    private readonly integrity: AuditIntegrityService,
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly auditRepo: AuditRecordRepository,
    @Inject(SECURITY_POLICY) private readonly policy: SecurityPolicy,
    @Inject(JOB_SCHEDULER) private readonly scheduler: JobScheduler,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  @Get('overview')
  @RequirePermissions('compliance:read')
  @ApiOperation({ summary: 'Effective security, retention and audit-chain status' })
  @ApiEnvelope(200, 'Overview', ComplianceOverviewDto)
  async overview(): Promise<ApiResult<ComplianceOverviewDto>> {
    const [stats, head] = await Promise.all([this.auditRepo.stats(), this.auditRepo.head()]);
    const p = this.policy.password;
    return this.ok({
      password: {
        minLength: p.minLength,
        requireUppercase: p.requireUppercase,
        requireLowercase: p.requireLowercase,
        requireDigit: p.requireDigit,
        requireSymbol: p.requireSymbol,
        historyCount: p.historyCount,
        maxAgeDays: p.maxAgeDays,
        minAgeHours: p.minAgeHours,
        expiryWarningDays: p.expiryWarningDays,
        changeOnFirstLogin: p.changeOnFirstLogin,
      },
      lockout: {
        maxFailedAttempts: this.config.auth.maxFailedAttempts,
        lockoutMinutes: this.config.auth.lockoutMinutes,
      },
      session: {
        idleTimeoutMinutes: Math.round(this.config.auth.sessionIdleTimeoutSeconds / 60),
        absoluteHours: this.config.auth.refreshTokenTtlSeconds / 3600,
        maxConcurrent: this.policy.session.maxConcurrent,
        newDeviceAlerts: this.policy.session.newDeviceAlerts,
      },
      mfa: { requiredRoles: this.policy.mfa.requiredRoles },
      retention: {
        enabled: this.config.retention.enabled,
        intervalHours: this.config.retention.intervalHours,
        policies: this.retention.policies(),
      },
      audit: {
        total: stats.total,
        unsealed: stats.unsealed,
        firstSeq: stats.firstSeq?.toString() ?? null,
        lastSeq: stats.lastSeq?.toString() ?? null,
        oldest: iso(stats.oldest),
        newest: iso(stats.newest),
        headHash: head?.hash ?? null,
        keyConfigured: !this.config.audit.chainKeyDerived,
      },
      jobs: this.scheduler.list().map((j) => ({
        ...j,
        lastStartedAt: iso(j.lastStartedAt),
        lastFinishedAt: iso(j.lastFinishedAt),
        nextRunAt: iso(j.nextRunAt),
      })),
    });
  }

  @Post('audit/verify')
  @HttpCode(200)
  @RequirePermissions('compliance:read')
  @AuthRateLimit()
  @ApiOperation({ summary: 'Recompute the audit hash chain and check anchors' })
  @ApiEnvelope(200, 'Integrity report', IntegrityReportDto)
  async verify(@CurrentPrincipal() principal: Principal): Promise<ApiResult<IntegrityReportDto>> {
    const report = await this.integrity.verify({
      id: principal.userId,
      username: principal.username,
    });
    return this.ok({ ...report, verifiedAt: report.verifiedAt.toISOString() });
  }

  @Get('audit/checkpoints')
  @RequirePermissions('compliance:read')
  @ApiOperation({ summary: 'Recent chain anchors and purge checkpoints' })
  @ApiEnvelope(200, 'Checkpoints', { type: 'array', items: AuditCheckpointDto.ref })
  async checkpoints(): Promise<ApiResult<AuditCheckpointDto[]>> {
    return this.ok((await this.auditRepo.listCheckpoints(null, 50)).map(checkpointDto));
  }

  @Post('audit/anchor')
  @HttpCode(200)
  @RequirePermissions('compliance:manage')
  @ApiOperation({ summary: 'Record the current chain head as an anchor' })
  @ApiEnvelope(200, 'Anchor', AuditCheckpointDto)
  async anchor(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ApiResult<AuditCheckpointDto | null>> {
    const checkpoint = await this.integrity.anchor({
      id: principal.userId,
      username: principal.username,
    });
    return this.ok(checkpoint ? checkpointDto(checkpoint) : null, 'Anchor recorded.');
  }

  @Get('retention/preview')
  @RequirePermissions('compliance:read')
  @ApiOperation({ summary: 'Records each policy would remove now (no changes)' })
  @ApiEnvelope(200, 'Preview')
  async preview(): Promise<ApiResult<Array<{ policy: string; cutoff: string; matched: number }>>> {
    return this.ok(await this.retention.preview());
  }

  @Post('retention/run')
  @HttpCode(200)
  @RequirePermissions('compliance:manage')
  @Audit({ action: 'RETENTION_RUN_REQUEST', category: 'SYSTEM', resourceType: 'RetentionRun' })
  @ApiOperation({ summary: 'Run every retention policy now (optionally as a dry run)' })
  @ApiZodBody(RunSchema)
  @ApiEnvelope(200, 'Run', RetentionRunDto)
  async run(
    @CurrentPrincipal() principal: Principal,
    @Body(zod(RunSchema)) body: z.infer<typeof RunSchema>,
  ): Promise<ApiResult<RetentionRunDto>> {
    const run = await this.retention.run({
      trigger: 'MANUAL',
      dryRun: body.dryRun,
      actor: { id: principal.userId, username: principal.username },
    });
    return this.ok(runDto(run), body.dryRun ? 'Dry run finished.' : 'Retention run finished.');
  }

  @Get('retention/runs')
  @RequirePermissions('compliance:read')
  @ApiOperation({ summary: 'Retention run history' })
  @ApiEnvelope(200, 'Runs', RetentionRunDto, true)
  async runs(
    @Query(zod(PageSchema)) query: z.infer<typeof PageSchema>,
  ): Promise<ApiResult<RetentionRunDto[]>> {
    return this.paginated(await this.retention.listRuns(query.page, query.pageSize), runDto);
  }

  @Post('jobs/:name/run')
  @HttpCode(200)
  @RequirePermissions('compliance:manage')
  @Audit({ action: 'JOB_TRIGGER', category: 'SYSTEM', resourceType: 'Job' })
  @ApiOperation({ summary: 'Run a background job now' })
  @ApiEnvelope(200, 'Triggered')
  async trigger(
    @Param('name', zod(z.string().regex(/^[a-z0-9-]{2,64}$/))) name: string,
  ): Promise<ApiResult<{ result: 'ran' | 'skipped' }>> {
    if (!this.scheduler.list().some((j) => j.name === name)) throw new NotFoundError('Job', name);
    return this.ok({ result: await this.scheduler.trigger(name) });
  }
}
