import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { NOTIFIER } from '#core/application/ports/notifier.port.js';
import {
  RETENTION_REGISTRY,
  type RetentionRegistry,
} from '#core/application/ports/retention.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { UsersModule } from '#modules/users/users.module.js';
import { NotificationRetentionPolicy } from './application/notification-retention.policy.js';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from './application/notification.ports.js';
import {
  NOTIFICATION_SETTINGS,
  NotificationService,
  type NotificationSettings,
} from './application/notification.service.js';
import { NotificationSubscribers } from './application/notification.subscribers.js';
import {
  BroadcastAnnouncementUseCase,
  NotificationInboxUseCases,
  NotificationPreferencesUseCases,
} from './application/notification.use-cases.js';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository.js';
import { NotificationsController } from './presentation/notifications.controller.js';

/**
 * Notifications: in-app inbox (folders, stars, archive, trash), e-mail channel,
 * per-user channel preferences, announcements, and the event subscribers that
 * turn application events into messages. Global so any feature can inject
 * NOTIFIER to message users directly.
 */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [NotificationsController],
  providers: [
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    {
      provide: NOTIFICATION_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): NotificationSettings => ({
        publicUrl: c.app.publicUrl,
        productName: 'NIB Digital Solutions',
      }),
    },
    NotificationService,
    { provide: NOTIFIER, useExisting: NotificationService },
    NotificationSubscribers,
    NotificationInboxUseCases,
    NotificationPreferencesUseCases,
    BroadcastAnnouncementUseCase,
  ],
  exports: [NOTIFIER],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: NotificationRepository,
    @Inject(RETENTION_REGISTRY) private readonly retention: RetentionRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.retention.register(
      new NotificationRetentionPolicy(this.repo, this.config.retention.notificationDays),
    );
  }
}
