import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFIER,
  type NotificationSeverity,
  type Notifier,
} from '#core/application/ports/notifier.port.js';
import type { Principal } from '#core/application/security/principal.js';
import { BusinessRuleError, NotFoundError } from '#core/domain/errors/app-error.js';
import type { Page } from '#core/domain/pagination.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import {
  CATEGORY_DEFAULTS,
  MANDATORY_IN_APP,
  NOTIFICATION_CATEGORIES,
  type NotificationAction,
  type NotificationCategory,
  type NotificationRecord,
} from '../domain/notification.js';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationCounts,
  type NotificationQuery,
  type NotificationRepository,
  type NotificationTarget,
} from './notification.ports.js';

/** The signed-in user's own inbox (every call is scoped to the principal). */
@Injectable()
export class NotificationInboxUseCases {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: NotificationRepository) {}

  list(principal: Principal, query: NotificationQuery): Promise<Page<NotificationRecord>> {
    return this.repo.findPage(principal.userId, query);
  }

  async summary(
    principal: Principal,
    latest = 8,
  ): Promise<{ counts: NotificationCounts; latest: NotificationRecord[] }> {
    const [counts, items] = await Promise.all([
      this.repo.counts(principal.userId),
      this.repo.latest(principal.userId, latest),
    ]);
    return { counts, latest: items };
  }

  async get(principal: Principal, id: string): Promise<NotificationRecord> {
    const found = await this.repo.findOne(principal.userId, id);
    if (!found) throw new NotFoundError('Notification', id);
    return found;
  }

  apply(
    principal: Principal,
    target: NotificationTarget,
    action: NotificationAction,
  ): Promise<number> {
    return this.repo.apply(principal.userId, target, action);
  }
}

export interface PreferenceView {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  /** In-app delivery cannot be turned off for this category. */
  inAppLocked: boolean;
}

@Injectable()
export class NotificationPreferencesUseCases {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: NotificationRepository) {}

  async get(principal: Principal): Promise<PreferenceView[]> {
    const saved = new Map(
      (await this.repo.preferences(principal.userId)).map((p) => [p.category, p]),
    );
    return NOTIFICATION_CATEGORIES.map((category) => {
      const locked = MANDATORY_IN_APP.includes(category);
      const choice = saved.get(category) ?? CATEGORY_DEFAULTS[category];
      return { category, inApp: locked || choice.inApp, email: choice.email, inAppLocked: locked };
    });
  }

  async save(
    principal: Principal,
    prefs: Array<{ category: NotificationCategory; inApp: boolean; email: boolean }>,
  ): Promise<PreferenceView[]> {
    await this.repo.savePreferences(
      principal.userId,
      prefs.map((p) => ({ ...p, inApp: MANDATORY_IN_APP.includes(p.category) || p.inApp })),
    );
    return this.get(principal);
  }
}

export interface BroadcastInput {
  audience: 'ALL' | 'ROLES';
  roles?: string[];
  severity: NotificationSeverity;
  title: string;
  body: string;
  link?: string | null;
}

/** Announcements from administrators to everyone or to selected roles. */
@Injectable()
export class BroadcastAnnouncementUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async execute(principal: Principal, input: BroadcastInput): Promise<{ recipients: number }> {
    if (input.audience === 'ROLES' && !input.roles?.length) {
      throw new BusinessRuleError('Choose at least one role.', 'AUDIENCE_REQUIRED');
    }
    const recipientIds = await this.users.findActiveUserIds(
      input.audience === 'ROLES' ? { roles: input.roles } : {},
      10_000,
    );
    const [sender] = await this.users.findContacts([principal.userId]);
    await this.notifier.send({
      recipientIds,
      category: 'ANNOUNCEMENT',
      severity: input.severity,
      template: 'announcement',
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      senderName: sender?.fullName ?? principal.username,
      threadKey: `announcement:${globalThis.crypto.randomUUID()}`,
    });
    return { recipients: recipientIds.length };
  }
}
