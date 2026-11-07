import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { APPROVAL_GATE } from '#core/application/ports/approval.port.js';
import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import {
  RETENTION_REGISTRY,
  type RetentionRegistry,
} from '#core/application/ports/retention.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { UsersModule } from '#modules/users/users.module.js';
import {
  APPROVAL_POLICY,
  ApprovalGateService,
  type ApprovalPolicy,
} from './application/approval-gate.service.js';
import { ApprovalRetentionPolicy } from './application/approval-retention.policy.js';
import { APPROVAL_REPOSITORY, type ApprovalRepository } from './application/approval.repository.js';
import { ApprovalUseCases } from './application/approval.use-cases.js';
import { PrismaApprovalRepository } from './infrastructure/prisma-approval.repository.js';
import { ApprovalsController } from './presentation/approvals.controller.js';

/**
 * Maker–checker approvals. Global: any feature injects APPROVAL_GATE to put an
 * operation under four-eyes control and registers an ApprovalHandler for it.
 */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [ApprovalsController],
  providers: [
    { provide: APPROVAL_REPOSITORY, useClass: PrismaApprovalRepository },
    {
      provide: APPROVAL_POLICY,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): ApprovalPolicy => ({
        enabled: c.approvals.enabled,
        actions: c.approvals.actions,
        expiryHours: c.approvals.expiryHours,
      }),
    },
    ApprovalGateService,
    { provide: APPROVAL_GATE, useExisting: ApprovalGateService },
    ApprovalUseCases,
  ],
  exports: [APPROVAL_GATE],
})
export class ApprovalsModule implements OnModuleInit {
  constructor(
    @Inject(APPROVAL_REPOSITORY) private readonly repo: ApprovalRepository,
    @Inject(RETENTION_REGISTRY) private readonly retention: RetentionRegistry,
    @Inject(JOB_SCHEDULER) private readonly scheduler: JobScheduler,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly approvals: ApprovalUseCases,
  ) {}

  onModuleInit(): void {
    this.retention.register(
      new ApprovalRetentionPolicy(this.repo, this.config.retention.approvalDays),
    );
    this.scheduler.register({
      name: 'approval-expiry',
      everyMs: 10 * 60_000,
      initialDelayMs: 90_000,
      run: () => this.approvals.expireDue(),
    });
  }
}
