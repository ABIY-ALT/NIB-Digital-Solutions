import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationDraft, Notifier } from '#core/application/ports/notifier.port.js';
import { USER_REPOSITORY, type UserRepository } from '#modules/users/domain/user.repository.js';
import {
  defaultsFor,
  MANDATORY_IN_APP,
  type NotificationCategory,
} from '../domain/notification.js';
import {
  MAIL_TRANSPORT,
  NOTIFICATION_REPOSITORY,
  type MailTransport,
  type NotificationRepository,
} from './notification.ports.js';

export const NOTIFICATION_SETTINGS = Symbol('NotificationSettings');

export interface NotificationSettings {
  /** Absolute product URL for links in e-mails. */
  publicUrl: string;
  productName: string;
}

/**
 * Delivers a notification to each recipient through the channels they chose
 * (in-app inbox, e-mail), falling back to category defaults. Security alerts
 * are always delivered in-app. Channel failures are logged, never thrown.
 */
@Injectable()
export class NotificationService implements Notifier {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: NotificationRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    @Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings,
  ) {}

  async send(draft: NotificationDraft): Promise<{ inApp: number; email: number }> {
    const recipients = [...new Set(draft.recipientIds)];
    if (recipients.length === 0) return { inApp: 0, email: 0 };

    const choices = await this.repo.choicesFor(recipients, draft.category);
    const defaults = defaultsFor(draft.category);
    const forced =
      draft.mandatory || MANDATORY_IN_APP.includes(draft.category as NotificationCategory);
    const inAppIds = recipients.filter(
      (id) => forced || (choices.get(id)?.inApp ?? defaults.inApp),
    );
    const emailIds = recipients.filter((id) => choices.get(id)?.email ?? defaults.email);

    const inApp = await this.repo.createMany(inAppIds, draft);
    const email = await this.sendEmails(emailIds, draft);
    return { inApp, email };
  }

  private async sendEmails(userIds: string[], draft: NotificationDraft): Promise<number> {
    if (userIds.length === 0) return 0;
    let sent = 0;
    const contacts = await this.users.findContacts(userIds);
    const link = draft.link ? `${this.settings.publicUrl}${draft.link}` : null;
    await Promise.all(
      contacts.map(async (c) => {
        try {
          await this.mail.send({
            to: c.email,
            toName: c.fullName,
            subject: `[${this.settings.productName}] ${draft.title}`,
            text: [
              `Hello ${c.fullName},`,
              '',
              draft.body,
              ...(link ? ['', `Open: ${link}`] : []),
              '',
              `— ${this.settings.productName}`,
              'You receive this e-mail because of your notification settings.',
            ].join('\n'),
          });
          sent += 1;
        } catch (error) {
          this.logger.warn({ err: error, userId: c.id }, 'Notification e-mail failed');
        }
      }),
    );
    return sent;
  }
}
