import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { AUDIT_LOGGER } from '#core/application/ports/audit-logger.port.js';
import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import {
  RETENTION_REGISTRY,
  type RetentionRegistry,
} from '#core/application/ports/retention.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import {
  AUDIT_CHAIN_KEY,
  AUDIT_RECORD_REPOSITORY,
  type AuditRecordRepository,
} from './application/audit-record.repository.js';
import { AuditIntegrityService } from './application/audit-integrity.service.js';
import { AuditRetentionPolicy } from './application/audit-retention.policy.js';
import { AuditService } from './application/audit.service.js';
import {
  AuditActivityUseCase,
  GetAuditLogUseCase,
  ListAuditLogsUseCase,
} from './application/list-audit-logs.use-case.js';
import { PersonalActivityUseCase } from './application/personal-activity.use-case.js';
import { PrismaAuditRecordRepository } from './infrastructure/prisma-audit-record.repository.js';
import { AuditLogsController } from './presentation/audit-logs.controller.js';
import { PersonalActivityController } from './presentation/personal-activity.controller.js';

/**
 * Audit trail: append-only, HMAC hash-chained records (tamper-evident), daily
 * chain anchors, and a retention policy that archives before purging.
 */
@Global()
@Module({
  controllers: [AuditLogsController, PersonalActivityController],
  providers: [
    {
      provide: AUDIT_CHAIN_KEY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.audit.chainKey,
    },
    { provide: AUDIT_RECORD_REPOSITORY, useClass: PrismaAuditRecordRepository },
    { provide: AUDIT_LOGGER, useClass: AuditService },
    ListAuditLogsUseCase,
    GetAuditLogUseCase,
    AuditActivityUseCase,
    PersonalActivityUseCase,
    AuditIntegrityService,
  ],
  exports: [AUDIT_LOGGER, AuditIntegrityService, AUDIT_RECORD_REPOSITORY],
})
export class AuditModule implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger('AuditModule');

  constructor(
    @Inject(AUDIT_RECORD_REPOSITORY) private readonly repo: AuditRecordRepository,
    @Inject(RETENTION_REGISTRY) private readonly retention: RetentionRegistry,
    @Inject(JOB_SCHEDULER) private readonly scheduler: JobScheduler,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly integrity: AuditIntegrityService,
  ) {}

  onModuleInit(): void {
    this.retention.register(new AuditRetentionPolicy(this.repo, this.config.retention.auditDays));
    this.scheduler.register({
      name: 'audit-chain-anchor',
      everyMs: 24 * 3_600_000,
      initialDelayMs: 5 * 60_000,
      run: () => this.integrity.anchor(null),
    });
    if (this.config.audit.chainKeyDerived) {
      this.logger.warn(
        'AUDIT_CHAIN_KEY is not set: using a key derived from MFA_SECRET_ENCRYPTION_KEY (development only).',
      );
    }
  }

  /** Records written before the chain existed are sealed on first start. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.repo.sealPending();
    } catch (error) {
      this.logger.error({ err: error }, 'Could not seal pending audit records');
    }
  }
}
