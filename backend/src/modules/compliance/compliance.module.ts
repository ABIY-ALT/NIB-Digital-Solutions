import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { JOB_SCHEDULER, type JobScheduler } from '#core/application/ports/job-scheduler.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { UsersModule } from '#modules/users/users.module.js';
import {
  RETENTION_RUNS,
  RETENTION_SETTINGS,
  RetentionService,
  type RetentionSettings,
} from './application/retention.service.js';
import { PrismaRetentionRunRepository } from './infrastructure/prisma-retention-run.repository.js';
import { ComplianceController } from './presentation/compliance.controller.js';

/**
 * Security & compliance: data retention engine (scheduled + on demand, with
 * archiving and run history) and the compliance console API (policies, audit
 * chain verification, anchors, jobs).
 */
@Module({
  imports: [UsersModule],
  controllers: [ComplianceController],
  providers: [
    { provide: RETENTION_RUNS, useClass: PrismaRetentionRunRepository },
    {
      provide: RETENTION_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): RetentionSettings => ({ batchSize: c.retention.batchSize }),
    },
    RetentionService,
  ],
})
export class ComplianceModule implements OnModuleInit {
  constructor(
    @Inject(JOB_SCHEDULER) private readonly scheduler: JobScheduler,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly retention: RetentionService,
  ) {}

  onModuleInit(): void {
    if (!this.config.retention.enabled) return;
    this.scheduler.register({
      name: 'data-retention',
      everyMs: this.config.retention.intervalHours * 3_600_000,
      initialDelayMs: 10 * 60_000,
      run: () => this.retention.run({ trigger: 'SCHEDULED', dryRun: false, actor: null }),
    });
  }
}
